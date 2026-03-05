// binary-utils.ts

// Legacy conversion functions
export function toHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHexString(hex: string): Uint8Array | null {
  try {
    const cleanHex = hex.replace(/\s+/g, "");
    if (cleanHex.length % 2 !== 0) return null;
    const matches = cleanHex.match(/.{1,2}/g);
    if (!matches) return null;
    return Uint8Array.from(matches.map((byte) => parseInt(byte, 16)));
  } catch (e) {
    return null;
  }
}

// Random binary data generator
export function generateRandomData(length: number = 20): Uint8Array {
  const newData = new Uint8Array(length);
  crypto.getRandomValues(newData);
  return newData;
}

// Clipboard helper (browser only)
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    console.log("Copied to clipboard!");
  } catch (e) {
    console.error("Failed to copy:", e);
  }
}

// Example modern wrappers (optional, browser dependent)
export function modernToHex(bytes: Uint8Array): string {
  // Fallback if the browser doesn't support modern methods
  if ((bytes as any).toHex) {
    return (bytes as any).toHex();
  }
  return toHexString(bytes);
}

export function modernFromHex(hex: string): Uint8Array | null {
  if ((Uint8Array as any).fromHex) {
    try {
      return (Uint8Array as any).fromHex(hex);
    } catch (e) {
      return null;
    }
  }
  return fromHexString(hex);
}

// Example usage
if (typeof window === 'undefined' && process.argv[1] === new URL(import.meta.url).pathname) {
  const data = generateRandomData(20);
  console.log("Random bytes:", data);
  const hex = toHexString(data);
  console.log("Hex:", hex);
  const backToBytes = fromHexString(hex);
  console.log("Back to bytes:", backToBytes);
}
