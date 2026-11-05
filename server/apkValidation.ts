import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";

export const MAX_APK_BYTES = 30 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 100_000;
const ZIP_LOCAL_FILE = 0x04034b50;
const ZIP_CENTRAL_FILE = 0x02014b50;
const ZIP_END = 0x06054b50;
const AXML = {
  document: 0x0003,
  stringPool: 0x0001,
  startElement: 0x0102,
  endElement: 0x0103,
};

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

function crc32(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function locateEndRecord(data: Buffer): number {
  const firstPossible = Math.max(0, data.length - 22 - 0xffff);
  for (let offset = data.length - 22; offset >= firstPossible; offset -= 1) {
    if (data.readUInt32LE(offset) !== ZIP_END) continue;
    const commentLength = data.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === data.length) return offset;
  }
  return -1;
}

function readLength8(data: Buffer, offset: number, end: number): { length: number; next: number } | null {
  if (offset >= end) return null;
  const first = data[offset];
  if ((first & 0x80) === 0) return { length: first, next: offset + 1 };
  if (offset + 1 >= end) return null;
  return { length: ((first & 0x7f) << 8) | data[offset + 1], next: offset + 2 };
}

function readLength16(data: Buffer, offset: number, end: number): { length: number; next: number } | null {
  if (offset + 2 > end) return null;
  const first = data.readUInt16LE(offset);
  if ((first & 0x8000) === 0) return { length: first, next: offset + 2 };
  if (offset + 4 > end) return null;
  return { length: ((first & 0x7fff) << 16) | data.readUInt16LE(offset + 2), next: offset + 4 };
}

function decodePoolString(data: Buffer, offset: number, limit: number, utf8: boolean): string | null {
  if (utf8) {
    const characterLength = readLength8(data, offset, limit);
    if (!characterLength || characterLength.length > MAX_MANIFEST_BYTES) return null;
    const byteLength = readLength8(data, characterLength.next, limit);
    if (!byteLength || byteLength.length > MAX_MANIFEST_BYTES) return null;
    const end = byteLength.next + byteLength.length;
    if (end >= limit || data[end] !== 0) return null;
    return data.toString("utf8", byteLength.next, end);
  }

  const characterLength = readLength16(data, offset, limit);
  if (!characterLength || characterLength.length > MAX_MANIFEST_BYTES / 2) return null;
  const byteLength = characterLength.length * 2;
  const end = characterLength.next + byteLength;
  if (end + 2 > limit || data.readUInt16LE(end) !== 0) return null;
  return data.toString("utf16le", characterLength.next, end);
}

function parseStringPool(data: Buffer, offset: number, headerSize: number, chunkSize: number): string[] | null {
  const end = offset + chunkSize;
  if (headerSize < 28 || chunkSize < headerSize || end > data.length) return null;
  const stringCount = data.readUInt32LE(offset + 8);
  const styleCount = data.readUInt32LE(offset + 12);
  const flags = data.readUInt32LE(offset + 16);
  const stringsStart = data.readUInt32LE(offset + 20);
  const stylesStart = data.readUInt32LE(offset + 24);
  if (stringCount === 0 || stringCount > MAX_ZIP_ENTRIES || styleCount > MAX_ZIP_ENTRIES) return null;

  const offsetsStart = offset + headerSize;
  const offsetsEnd = offsetsStart + (stringCount + styleCount) * 4;
  const stringDataStart = offset + stringsStart;
  const stringDataEnd = stylesStart ? offset + stylesStart : end;
  if (offsetsEnd > end || stringDataStart < offsetsEnd || stringDataEnd > end || stringDataEnd < stringDataStart) return null;

  const strings: string[] = [];
  const utf8 = (flags & 0x100) !== 0;
  for (let index = 0; index < stringCount; index += 1) {
    const relativeOffset = data.readUInt32LE(offsetsStart + index * 4);
    const stringOffset = stringDataStart + relativeOffset;
    if (stringOffset < stringDataStart || stringOffset >= stringDataEnd) return null;
    const value = decodePoolString(data, stringOffset, stringDataEnd, utf8);
    if (value === null) return null;
    strings.push(value);
  }
  return strings;
}

function rootHasPackageAttribute(data: Buffer, offset: number, chunkSize: number, headerSize: number, strings: string[]): boolean {
  if (headerSize < 16 || chunkSize < headerSize) return false;
  const attributeStart = offset + 16 + data.readUInt16LE(offset + 24);
  const attributeSize = data.readUInt16LE(offset + 26);
  const attributeCount = data.readUInt16LE(offset + 28);
  const chunkEnd = offset + chunkSize;
  if (attributeCount === 0 || attributeSize < 20 || attributeStart < offset + headerSize || attributeStart + attributeCount * attributeSize > chunkEnd) return false;

  for (let index = 0; index < attributeCount; index += 1) {
    const attribute = attributeStart + index * attributeSize;
    const nameIndex = data.readUInt32LE(attribute + 4);
    if (strings[nameIndex] !== "package") continue;
    const rawValueIndex = data.readUInt32LE(attribute + 8);
    const valueType = data[attribute + 15];
    const typedValueIndex = data.readUInt32LE(attribute + 16);
    const packageName = rawValueIndex !== 0xffffffff && rawValueIndex < strings.length
      ? strings[rawValueIndex]
      : valueType === 0x03 && typedValueIndex < strings.length
        ? strings[typedValueIndex]
        : "";
    return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(packageName);
  }
  return false;
}

function isAndroidBinaryManifest(data: Buffer): boolean {
  if (data.length < 8 || data.readUInt16LE(0) !== AXML.document || data.readUInt16LE(2) !== 8 || data.readUInt32LE(4) !== data.length) return false;

  let strings: string[] | null = null;
  let rootNameIndex = -1;
  let rootStartFound = false;
  let rootEndFound = false;
  let packageFound = false;
  let offset = 8;
  while (offset < data.length) {
    if (offset + 8 > data.length) return false;
    const type = data.readUInt16LE(offset);
    const headerSize = data.readUInt16LE(offset + 2);
    const chunkSize = data.readUInt32LE(offset + 4);
    if (headerSize < 8 || chunkSize < headerSize || offset + chunkSize > data.length) return false;

    if (type === AXML.stringPool) {
      if (strings !== null || rootStartFound) return false;
      strings = parseStringPool(data, offset, headerSize, chunkSize);
      if (!strings) return false;
    } else if (type === AXML.startElement && !rootStartFound) {
      if (!strings || headerSize < 16 || chunkSize < 36) return false;
      rootNameIndex = data.readUInt32LE(offset + 20);
      if (strings[rootNameIndex] !== "manifest") return false;
      packageFound = rootHasPackageAttribute(data, offset, chunkSize, headerSize, strings);
      rootStartFound = true;
    } else if (type === AXML.endElement && rootStartFound && !rootEndFound) {
      if (headerSize < 16 || chunkSize < 24) return false;
      if (data.readUInt32LE(offset + 20) === rootNameIndex) rootEndFound = true;
    }
    offset += chunkSize;
  }
  return offset === data.length && Boolean(strings) && rootStartFound && rootEndFound && packageFound;
}

/** Validate a bounded ZIP archive, its real root manifest entry, and Android binary XML identity. */
export function looksLikeAndroidApk(input: Uint8Array): boolean {
  if (input.length < 22 || input.length > MAX_APK_BYTES) return false;
  try {
    const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    const endRecord = locateEndRecord(data);
    if (endRecord < 0) return false;

    const diskNumber = data.readUInt16LE(endRecord + 4);
    const centralDisk = data.readUInt16LE(endRecord + 6);
    const entriesOnDisk = data.readUInt16LE(endRecord + 8);
    const totalEntries = data.readUInt16LE(endRecord + 10);
    const centralSize = data.readUInt32LE(endRecord + 12);
    const centralOffset = data.readUInt32LE(endRecord + 16);
    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries || totalEntries === 0 || totalEntries === 0xffff || totalEntries > MAX_ZIP_ENTRIES) return false;
    if (centralSize === 0xffffffff || centralOffset === 0xffffffff || centralOffset + centralSize !== endRecord) return false;

    const centralEnd = centralOffset + centralSize;
    let cursor = centralOffset;
    let manifest: Buffer | null = null;

    for (let index = 0; index < totalEntries; index += 1) {
      if (cursor + 46 > centralEnd || data.readUInt32LE(cursor) !== ZIP_CENTRAL_FILE) return false;
      const flags = data.readUInt16LE(cursor + 8);
      const method = data.readUInt16LE(cursor + 10);
      const expectedCrc = data.readUInt32LE(cursor + 16);
      const compressedSize = data.readUInt32LE(cursor + 20);
      const uncompressedSize = data.readUInt32LE(cursor + 24);
      const fileNameLength = data.readUInt16LE(cursor + 28);
      const extraLength = data.readUInt16LE(cursor + 30);
      const commentLength = data.readUInt16LE(cursor + 32);
      const startDisk = data.readUInt16LE(cursor + 34);
      const localHeaderOffset = data.readUInt32LE(cursor + 42);
      const next = cursor + 46 + fileNameLength + extraLength + commentLength;
      if (next > centralEnd || startDisk !== 0 || localHeaderOffset === 0xffffffff || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) return false;
      if ((flags & 1) !== 0 || (method !== 0 && method !== 8)) return false;
      const centralName = data.subarray(cursor + 46, cursor + 46 + fileNameLength);
      const fileName = centralName.toString("utf8");

      if (localHeaderOffset + 30 > centralOffset || data.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE) return false;
      const localFlags = data.readUInt16LE(localHeaderOffset + 6);
      const localMethod = data.readUInt16LE(localHeaderOffset + 8);
      const localNameLength = data.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = data.readUInt16LE(localHeaderOffset + 28);
      const localNameStart = localHeaderOffset + 30;
      const compressedStart = localNameStart + localNameLength + localExtraLength;
      const compressedEnd = compressedStart + compressedSize;
      if (localFlags !== flags || localMethod !== method || localNameLength !== fileNameLength || compressedEnd > centralOffset) return false;
      if (!data.subarray(localNameStart, localNameStart + localNameLength).equals(centralName)) return false;
      if ((flags & 0x0008) === 0) {
        if (data.readUInt32LE(localHeaderOffset + 14) !== expectedCrc || data.readUInt32LE(localHeaderOffset + 18) !== compressedSize || data.readUInt32LE(localHeaderOffset + 22) !== uncompressedSize) return false;
      }

      if (fileName === "AndroidManifest.xml") {
        if (manifest || compressedSize > MAX_MANIFEST_BYTES || uncompressedSize > MAX_MANIFEST_BYTES) return false;
        const compressed = data.subarray(compressedStart, compressedEnd);
        let extracted: Buffer;
        try {
          extracted = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_MANIFEST_BYTES });
        } catch {
          return false;
        }
        if (extracted.length !== uncompressedSize || crc32(extracted) !== expectedCrc || !isAndroidBinaryManifest(extracted)) return false;
        manifest = extracted;
      }
      cursor = next;
    }

    return cursor === centralEnd && manifest !== null;
  } catch {
    return false;
  }
}
