import bs58 from "bs58";

export type PayloadFormat = "bytes" | "base58" | "base64" | "hex";

export function detectAndConvert(payload: string): {
  buffer: Uint8Array;
  detectedFormat: PayloadFormat;
} {
  if (/^[0-9a-fA-F]+$/.test(payload) && payload.length % 2 === 0) {
    const bytes = Uint8Array.from(
      payload.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)),
    );
    return { buffer: bytes, detectedFormat: "hex" };
  }

  const base58Re =
    /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
  if (base58Re.test(payload)) {
    try {
      return { buffer: bs58.decode(payload), detectedFormat: "base58" };
    } catch {}
  }

  const b64Re =
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;
  const b64urlRe =
    /^(?:[A-Za-z0-9\-_]{4})*(?:[A-Za-z0-9\-_]{2}(?:==)?|[A-Za-z0-9\-_]{3}=?|[A-Za-z0-9\-_]{4})$/;
  const norm = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    norm + (norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "");
  if (b64Re.test(payload) || b64urlRe.test(payload)) {
    try {
      const bin = atob(padded);
      return {
        buffer: Uint8Array.from(bin, (c) => c.charCodeAt(0)),
        detectedFormat: "base64",
      };
    } catch {}
  }

  // If none of the recognised text encodings matched, treat the input
  // as raw single-byte characters (Latin-1) and return their code units.
  const bin = Array.from(payload).map((c) => c.charCodeAt(0));
  return { buffer: Uint8Array.from(bin), detectedFormat: "bytes" };
}
