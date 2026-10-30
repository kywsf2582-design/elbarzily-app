const startsWith = (data: Uint8Array, prefix: number[]) => prefix.every((value, index) => data[index] === value);

export function matchesSupportedVoiceMime(data: Uint8Array, declaredMime: string): boolean {
  const mime = declaredMime.split(";", 1)[0].trim().toLowerCase();
  if (mime === "audio/webm") return startsWith(data, [0x1a, 0x45, 0xdf, 0xa3]);
  if (mime === "audio/ogg") return data.length >= 4 && String.fromCharCode(...data.slice(0, 4)) === "OggS";
  if (mime === "audio/wav" || mime === "audio/x-wav")
    return data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === "RIFF" && String.fromCharCode(...data.slice(8, 12)) === "WAVE";
  if (mime === "audio/mp4" || mime === "audio/m4a")
    return data.length >= 12 && String.fromCharCode(...data.slice(4, 8)) === "ftyp";
  if (mime === "audio/mpeg")
    return data.length >= 3 && (String.fromCharCode(...data.slice(0, 3)) === "ID3" || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0));
  return false;
}
