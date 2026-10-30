import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { looksLikeAndroidApk, MAX_APK_BYTES } from "./apkValidation";

function crc32(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}

function makeBinaryManifest(): Buffer {
  const names = ["manifest", "package", "com.elbarzily.app"];
  const strings: Buffer[] = [];
  const stringOffsets: number[] = [];
  let stringBytesLength = 0;
  for (const value of names) {
    const encoded = Buffer.from(value, "utf8");
    stringOffsets.push(stringBytesLength);
    const entry = Buffer.concat([Buffer.from([value.length, encoded.length]), encoded, Buffer.from([0])]);
    const padded = Buffer.alloc(Math.ceil(entry.length / 4) * 4);
    entry.copy(padded);
    strings.push(padded);
    stringBytesLength += padded.length;
  }

  const stringData = Buffer.concat(strings);
  const stringPoolHeaderSize = 28;
  const stringOffsetsSize = stringOffsets.length * 4;
  const stringPoolSize = stringPoolHeaderSize + stringOffsetsSize + stringData.length;
  const stringPool = Buffer.alloc(stringPoolSize);
  stringPool.writeUInt16LE(0x0001, 0);
  stringPool.writeUInt16LE(stringPoolHeaderSize, 2);
  stringPool.writeUInt32LE(stringPoolSize, 4);
  stringPool.writeUInt32LE(names.length, 8);
  stringPool.writeUInt32LE(0, 12);
  stringPool.writeUInt32LE(0x100, 16);
  stringPool.writeUInt32LE(stringPoolHeaderSize + stringOffsetsSize, 20);
  stringPool.writeUInt32LE(0, 24);
  stringOffsets.forEach((offset, index) => stringPool.writeUInt32LE(offset, stringPoolHeaderSize + index * 4));
  stringData.copy(stringPool, stringPoolHeaderSize + stringOffsetsSize);

  const startElementSize = 56;
  const startElement = Buffer.alloc(startElementSize);
  startElement.writeUInt16LE(0x0102, 0);
  startElement.writeUInt16LE(16, 2);
  startElement.writeUInt32LE(startElementSize, 4);
  startElement.writeUInt32LE(1, 8);
  startElement.writeUInt32LE(0xffffffff, 12);
  startElement.writeUInt32LE(0xffffffff, 16);
  startElement.writeUInt32LE(0, 20);
  startElement.writeUInt16LE(20, 24);
  startElement.writeUInt16LE(20, 26);
  startElement.writeUInt16LE(1, 28);
  const packageAttribute = 36;
  startElement.writeUInt32LE(0xffffffff, packageAttribute);
  startElement.writeUInt32LE(1, packageAttribute + 4);
  startElement.writeUInt32LE(2, packageAttribute + 8);
  startElement.writeUInt16LE(8, packageAttribute + 12);
  startElement[packageAttribute + 14] = 0;
  startElement[packageAttribute + 15] = 0x03;
  startElement.writeUInt32LE(2, packageAttribute + 16);

  const endElement = Buffer.alloc(24);
  endElement.writeUInt16LE(0x0103, 0);
  endElement.writeUInt16LE(16, 2);
  endElement.writeUInt32LE(24, 4);
  endElement.writeUInt32LE(2, 8);
  endElement.writeUInt32LE(0xffffffff, 12);
  endElement.writeUInt32LE(0xffffffff, 16);
  endElement.writeUInt32LE(0, 20);

  const contents = Buffer.concat([stringPool, startElement, endElement]);
  const document = Buffer.alloc(8);
  document.writeUInt16LE(0x0003, 0);
  document.writeUInt16LE(8, 2);
  document.writeUInt32LE(8 + contents.length, 4);
  return Buffer.concat([document, contents]);
}

function makeZipEntry(fileName: string, contents: Buffer, compression: "store" | "deflate" = "store"): Buffer {
  const name = Buffer.from(fileName, "utf8");
  const compressed = compression === "store" ? contents : deflateRawSync(contents);
  const method = compression === "store" ? 0 : 8;
  const crc = crc32(contents);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(contents.length, 22);
  local.writeUInt16LE(name.length, 26);
  const localRecord = Buffer.concat([local.subarray(0, 30), name, compressed]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(contents.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt32LE(0, 42);
  const centralRecord = Buffer.concat([central, name]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralRecord.length, 12);
  end.writeUInt32LE(localRecord.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localRecord, centralRecord, end]);
}

describe("Android APK validation", () => {
  it("accepts a well-formed ZIP with a root Android binary manifest and package id", () => {
    expect(looksLikeAndroidApk(makeZipEntry("AndroidManifest.xml", makeBinaryManifest()))).toBe(true);
  });

  it("accepts a deflated manifest and verifies its integrity", () => {
    expect(looksLikeAndroidApk(makeZipEntry("AndroidManifest.xml", makeBinaryManifest(), "deflate"))).toBe(true);
  });

  it("rejects a marker string without an actual ZIP central directory", () => {
    expect(looksLikeAndroidApk(Buffer.from("PK\x03\x04 AndroidManifest.xml"))).toBe(false);
  });

  it("rejects a ZIP with no exact root manifest entry", () => {
    expect(looksLikeAndroidApk(makeZipEntry("assets/AndroidManifest.xml", makeBinaryManifest()))).toBe(false);
  });

  it("rejects a ZIP entry whose manifest is not Android binary XML", () => {
    expect(looksLikeAndroidApk(makeZipEntry("AndroidManifest.xml", Buffer.from("<manifest package=\"com.example.app\"/>")))).toBe(false);
  });

  it("rejects a corrupt central-directory signature", () => {
    const archive = makeZipEntry("AndroidManifest.xml", makeBinaryManifest());
    const end = archive.length - 22;
    const centralOffset = archive.readUInt32LE(end + 16);
    archive.writeUInt32LE(0, centralOffset);
    expect(looksLikeAndroidApk(archive)).toBe(false);
  });

  it("caps uploads at 30 MiB", () => {
    expect(MAX_APK_BYTES).toBe(30 * 1024 * 1024);
  });
});
