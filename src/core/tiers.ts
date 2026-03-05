export function getIdByteLength(wordLength: number): number {
  if (wordLength <= 4) return 2;
  if (wordLength <= 9) return 3;
  return 4;
}

export function getWrapByteLength(wordLength: number): number {
  if (wordLength <= 4) return 2;
  if (wordLength <= 9) return 3;
  return 4;
}

export async function getTextEncoder(): Promise<TextEncoder> {
  if (typeof TextEncoder !== "undefined") return new TextEncoder();
  const { TextEncoder: NodeTextEncoder } = await import("node:util");
  // @ts-ignore Node typings
  return new NodeTextEncoder();
}

export async function wrapBase64(data: string): Promise<Uint8Array> {
  const normalized = data.trim().toLowerCase();
  if (!normalized) throw new Error("Cannot generate ID for empty string");

  const encoder = await getTextEncoder();
  const result = encoder.encode(normalized);

  // Browser + Node compatible SHA-256
  let hash: ArrayBuffer;
  const anyCrypto: any = (globalThis as any).crypto;
  if (anyCrypto && anyCrypto.subtle) {
    hash = await anyCrypto.subtle.digest("SHA-256", result);
  } else {
    const { createHash } = await import("node:crypto");
    hash = createHash("sha256").update(Buffer.from(result)).digest().buffer;
  }

  const hashBytes = new Uint8Array(hash);
  const size = getWrapByteLength(normalized.length);
  return hashBytes.slice(0, size);
}
