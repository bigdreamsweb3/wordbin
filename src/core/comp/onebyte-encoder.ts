export function fullEncode(input: string): Uint8Array {
  const utf8Encoder = new TextEncoder();
  const usedBytes = new Set<number>();
  const multiChars = new Set<string>();

  // Detect 1-byte vs multi-byte chars
  for (const char of input) {
    const bytes = utf8Encoder.encode(char);
    if (bytes.length > 1) multiChars.add(char);
    else usedBytes.add(bytes[0]);
  }

  const availableBytes: number[] = [];
  for (let i = 0; i < 256; i++) if (!usedBytes.has(i)) availableBytes.push(i);

  // Map multi-byte chars → available bytes
  const charToByte = new Map<string, number>();
  const mapEntries: [number, number][] = [];
  Array.from(multiChars).forEach((char, i) => {
    if (i >= availableBytes.length) return;
    const byte = availableBytes[i];
    charToByte.set(char, byte);
    mapEntries.push([byte, char.codePointAt(0)!]);
  });

  // Header
  const ENTRY_SIZE = 5;
  const headerSize = 1 + mapEntries.length * ENTRY_SIZE;
  const result: number[] = [];
  result.push(mapEntries.length);

  for (const [byte, code] of mapEntries) {
    result.push(byte);
    result.push((code >> 24) & 0xff);
    result.push((code >> 16) & 0xff);
    result.push((code >> 8) & 0xff);
    result.push(code & 0xff);
  }

  // Encode payload using code points (handle surrogate pairs)
  for (const char of input) {
    const byte = charToByte.get(char);
    if (byte !== undefined) result.push(byte);
    else {
      const code = char.codePointAt(0)!;
      if (code <= 0xff) result.push(code);
      else {
        // Split into 2 bytes for BMP or store as-is for 1-byte mapping
        result.push((code >> 8) & 0xff, code & 0xff);
      }
    }
  }

  return new Uint8Array(result);
}

export function fullDecode(data: Uint8Array): string {
  const mapSize = data[0];
  const ENTRY_SIZE = 5;
  const headerSize = 1 + mapSize * ENTRY_SIZE;
  const byteToChar = new Map<number, string>();

  for (let i = 0; i < mapSize; i++) {
    const offset = 1 + i * ENTRY_SIZE;
    const byte = data[offset];
    const code =
      (data[offset + 1] << 24) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 8) |
      data[offset + 4];
    byteToChar.set(byte, String.fromCodePoint(code));
  }

  const payload = data.subarray(headerSize);
  let result = "";

  for (let i = 0; i < payload.length; i++) {
    const byte = payload[i];
    if (byteToChar.has(byte)) result += byteToChar.get(byte);
    else result += String.fromCharCode(byte);
  }

  return result;
}
