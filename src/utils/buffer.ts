export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

export function toBase64(bytes: Uint8Array): string {
  const b64 = (globalThis as any).btoa
  if (typeof b64 === 'function') {
    return b64(String.fromCharCode(...bytes))
  }
  // Node fallback
  return Buffer.from(bytes).toString('base64')
}

export function fromBase64(base64: string): Uint8Array {
  const at = (globalThis as any).atob
  if (typeof at === 'function') {
    const binary = at(base64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  }
  // Node fallback
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

// UTF-8 helpers
export function utf8Encode(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str)
  // Node fallback
  return new Uint8Array(Buffer.from(str, 'utf8'))
}

export function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes)
  // Node fallback
  return Buffer.from(bytes).toString('utf8')
}

// Varint (LEB128 7-bit groups) helpers
export function encodeVarint(n: number): Uint8Array {
  if (n < 0) throw new Error('Varint cannot encode negative numbers')
  const out: number[] = []
  do {
    let byte = n & 0x7f
    n >>>= 7
    if (n !== 0) byte |= 0x80
    out.push(byte)
  } while (n !== 0)
  return new Uint8Array(out)
}

export function decodeVarint(bytes: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let result = 0
  let shift = 0
  let pos = offset
  while (pos < bytes.length) {
    const byte = bytes[pos++]
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) {
      return { value: result, bytesRead: pos - offset }
    }
    shift += 7
    if (shift > 35) throw new Error('Varint too large')
  }
  throw new Error('Truncated varint')
}
