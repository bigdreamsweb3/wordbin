import { LITERAL } from "../constants.js";
import {
  toHex,
  toBase64,
  encodeVarint,
  decodeVarint,
  utf8Encode,
  utf8Decode,
} from "../utils/buffer.js";
import type { EncodeResult, WordBinDictionary } from "../types.js";
import { buildDictionary } from "../dict/builder.js";
import {
  loadDictionaryByVersion,
  loadLatestDictionary,
  getAllAvailableDictionaryVersions,
} from "../dict/dictionary-loader.js";
import bs58 from "bs58";

// ─── Types ────────────────────────────────────────────────────────────────────

type PayloadFormat = "bytes" | "base58" | "base64" | "hex" | "bin21";

export interface DecodeResult {
  /** The decoded text — words for WordBin payloads, best-effort for others. */
  text: string;
  /** True only when the payload was a valid, fully-parsed WordBin stream. */
  isWordBin: boolean;
  /** Auto-detected wire format of the input. */
  detectedFormat: PayloadFormat;
  /**
   * Human-readable notice when the payload is not a valid WordBin stream.
   * Includes information about what the decoder did as a fallback.
   */
  notice?: string;
  /**
   * Present when partial scanning was used (non-WordBin payloads).
   * Lists raw byte sequences that had no dictionary match, in order.
   */
  rawSegments?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Standard hex encoding — every byte zero-padded to exactly 2 chars. */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Payload format detection ─────────────────────────────────────────────────

/**
 * Detects the wire format of a string payload and converts it to raw bytes.
 *
 * Priority:
 *  1. Pure hex string  (only 0-9 a-f, even length)
 *  2. Base58           (only Base58 alphabet chars)
 *  3. Base64 / Base64url
 *  4. Binary / Latin-1 (bin21Payload / payload field from encode())
 */
function detectAndConvert(payload: string): {
  buffer: Uint8Array;
  detectedFormat: PayloadFormat;
} {
  // 1. Hex
  if (/^[0-9a-fA-F]+$/.test(payload) && payload.length % 2 === 0) {
    const bytes = Uint8Array.from(
      payload.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)),
    );
    return { buffer: bytes, detectedFormat: "hex" };
  }

  // 2. Base58
  const base58Re =
    /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
  if (base58Re.test(payload)) {
    try {
      return { buffer: bs58.decode(payload), detectedFormat: "base58" };
    } catch {
      /* fall through */
    }
  }

  // 3. Base64 / Base64url
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
    } catch {
      /* fall through */
    }
  }

  // 4. Binary / Latin-1
  const bytes = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) bytes[i] = payload.charCodeAt(i);
  return { buffer: bytes, detectedFormat: "bin21" };
}

// ─── WordBin ──────────────────────────────────────────────────────────────────

export class WordBin {
  private primaryDictVersion: number;
  private log: (...args: any[]) => void;

  constructor(initialDict?: WordBinDictionary, options?: { debug?: boolean }) {
    this.primaryDictVersion = initialDict?.version ?? 1;
    this.log = options?.debug
      ? (...args: any[]) => console.log("[WordBin]", ...args)
      : () => {};
  }

  static async createFromWords(words: string[]): Promise<WordBin> {
    console.warn(
      "Building dictionary from scratch – consider using pre-built files",
    );
    return new WordBin(await buildDictionary(words));
  }

  static async createFromJson(dictJson: WordBinDictionary): Promise<WordBin> {
    return new WordBin(dictJson);
  }

  static async create(options?: { debug?: boolean }): Promise<WordBin> {
    return new WordBin(await loadLatestDictionary(), options);
  }

  private async getMapsForVersion(version: number): Promise<{
    reverseMap: Map<string, string>;
    forwardMap: Map<string, Uint8Array>;
    sortedIdLengths: number[];
  }> {
    const dict = await loadDictionaryByVersion(version);
    const reverseMap = new Map<string, string>();
    const forwardMap = new Map<string, Uint8Array>();
    const idLengths = new Set<number>();

    for (const [hex, words] of Object.entries(dict.words)) {
      if (!words.length) continue;
      if (words.length > 1) {
        throw new Error(
          `Dictionary corruption: ID ${hex} maps to multiple words`,
        );
      }
      const word = words[0];
      const bytes = Buffer.from(hex, "hex");
      idLengths.add(bytes.length);
      reverseMap.set(hex, word);
      forwardMap.set(word, bytes);
    }

    return {
      reverseMap,
      forwardMap,
      sortedIdLengths: Array.from(idLengths).sort((a, b) => b - a),
    };
  }

  // ── encode ──────────────────────────────────────────────────────────────────

  async encode(
    text: string | EncodeResult | Uint8Array,
    options?: { dictVersion?: number },
  ): Promise<EncodeResult> {
    let textStr: string;
    if (typeof text === "string") {
      textStr = text;
    } else if (text instanceof Uint8Array) {
      textStr = toBase64(text);
    } else {
      textStr = text.base64Payload;
    }

    const trimmed = textStr.trim();
    if (!trimmed) {
      return {
        originalText: "",
        dictVersion: this.primaryDictVersion,
        encoded: new Uint8Array(0),
        payload: "",
        bin21: "",
        bin21Payload: "",
        base64Payload: "",
        hexPayload: "",
        base58Payload: "",
        originalBytes: 0,
        encodedBytes: 0,
        bytesSaved: 0,
        ratioPercent: 100,
      };
    }

    const useVersion = options?.dictVersion ?? this.primaryDictVersion;
    const { forwardMap } = await this.getMapsForVersion(useVersion);
    const chunks: Uint8Array[] = [new Uint8Array([useVersion])];

    for (const w of trimmed.split(/\s+/).filter(Boolean)) {
      const id = forwardMap.get(w);
      if (id) {
        chunks.push(id);
      } else {
        const utf8 = utf8Encode(w);
        const lenVarint = encodeVarint(utf8.length);
        const out = new Uint8Array(1 + lenVarint.length + utf8.length);
        out[0] = LITERAL;
        out.set(lenVarint, 1);
        out.set(utf8, 1 + lenVarint.length);
        chunks.push(out);
      }
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    const originalBytes = new TextEncoder().encode(textStr).length;

    // ── All payload representations derived directly from `result` ────────────
    // hexPayload: standard lowercase hex, 2 chars per byte, zero-padded.
    const hexPayload = bytesToHex(result);

    // bin21Payload / payload: Latin-1 string, 1 char per byte.
    const bin21Payload = Array.from(result)
      .map((b) => String.fromCharCode(b))
      .join("");

    // base64: via existing toBase64 util.
    const base64Payload = toBase64(result);

    // base58: directly from the raw result bytes.
    const base58Payload = bs58.encode(result);

    return {
      originalText: textStr,
      dictVersion: useVersion,
      encoded: result,
      bin21: bin21Payload,
      payload: bin21Payload,
      bin21Payload,
      hexPayload,
      base64Payload,
      base58Payload,
      originalBytes,
      encodedBytes: bin21Payload.length,
      bytesSaved: originalBytes - bin21Payload.length,
      ratioPercent:
        Math.round((bin21Payload.length / originalBytes) * 10000) / 100,
    };
  }

  // ── decode ───────────────────────────────────────────────────────────────────

  /**
   * Decodes any supported payload format back to human-readable text.
   *
   * For valid WordBin payloads:  returns the exact original words.
   * For non-WordBin payloads:    scans byte-by-byte, extracts dictionary words
   *                               wherever possible, and preserves unrecognised
   *                               bytes as "[0xXX]" markers.
   */
  async decode(payload: Uint8Array | string): Promise<DecodeResult> {
    // ── Step 1: wire-format → raw bytes ───────────────────────────────────────
    let buffer: Uint8Array;
    let detectedFormat: PayloadFormat;

    if (payload instanceof Uint8Array) {
      buffer = payload;
      detectedFormat = "bytes";
    } else {
      ({ buffer, detectedFormat } = detectAndConvert(payload));
    }

    this.log(
      `[decode] format=${detectedFormat} bufLen=${buffer.length} ` +
        `firstBytes=[${Array.from(buffer.slice(0, 8)).join(",")}]`,
    );

    if (buffer.length < 1) {
      return {
        text: "",
        isWordBin: false,
        detectedFormat,
        notice: "Payload is empty — nothing to decode.",
      };
    }

    // ── Step 2: try every installed dictionary (strict WordBin parse) ──────────
    //
    // For each version we try two start positions:
    //   pos=1  treat byte[0] as the version header and skip it
    //   pos=0  treat the entire buffer as payload (no header present)
    const availableVersions = await getAllAvailableDictionaryVersions();
    const versionByte = buffer[0];
    const versionIsHeader = availableVersions.includes(versionByte);

    this.log(
      `[decode] availableVersions=[${availableVersions.join(",")}] ` +
        `versionByte=${versionByte} isKnownHeader=${versionIsHeader}`,
    );

    // Put the version that matches byte[0] first so the fast path is tried first.
    const tryOrder = versionIsHeader
      ? [versionByte, ...availableVersions.filter((v) => v !== versionByte)]
      : [...availableVersions];

    for (const ver of tryOrder) {
      let maps: { reverseMap: Map<string, string>; sortedIdLengths: number[] };
      try {
        maps = await this.getMapsForVersion(ver);
      } catch (err) {
        this.log(`[decode] v${ver}: getMapsForVersion threw — ${err}`);
        continue;
      }
      const { reverseMap, sortedIdLengths } = maps;

      // pos=1: standard WordBin stream with header byte
      const r1 =
        this.greedyDecode(buffer, 1, reverseMap, sortedIdLengths) ??
        this.tryDecode(1, buffer, reverseMap, [], 0, sortedIdLengths);
      this.log(
        `[decode] v${ver} strict(pos=1): ${r1 !== null ? `"${r1}"` : "null"}`,
      );
      if (r1 !== null) {
        const notice =
          versionByte === ver
            ? undefined
            : `Byte[0]=${versionByte} is not a recognised version header but ` +
              `decoded successfully with dictionary v${ver}.`;
        return { text: r1, isWordBin: true, detectedFormat, notice };
      }

      // pos=0: payload with no header byte
      const r0 =
        this.greedyDecode(buffer, 0, reverseMap, sortedIdLengths) ??
        this.tryDecode(0, buffer, reverseMap, [], 0, sortedIdLengths);
      this.log(
        `[decode] v${ver} strict(pos=0): ${r0 !== null ? `"${r0}"` : "null"}`,
      );
      if (r0 !== null) {
        return {
          text: r0,
          isWordBin: true,
          detectedFormat,
          notice: `Payload had no version header. Decoded using dictionary v${ver}.`,
        };
      }
    }

    // ── Step 3: partial / best-effort scan ────────────────────────────────────
    //
    // No strict parse succeeded. Scan byte-by-byte across every available
    // dictionary and extract words wherever the bytes match a dictionary ID.
    // Bytes that match nothing are preserved as "[0xXX]" markers.
    // This ensures the decoder never silently discards data.
    this.log(`[decode] strict parse failed — falling back to partial scan`);

    if (availableVersions.length > 0) {
      // Use the latest available dictionary for the scan.
      const scanVersion = availableVersions[availableVersions.length - 1];
      try {
        const { reverseMap, sortedIdLengths } =
          await this.getMapsForVersion(scanVersion);

        // Try scanning from pos=1 (skip possible header) and pos=0, pick the
        // one that recognises more words.
        const scan1 = this.partialScan(buffer, 1, reverseMap, sortedIdLengths);
        const scan0 = this.partialScan(buffer, 0, reverseMap, sortedIdLengths);
        const best = scan1.wordCount >= scan0.wordCount ? scan1 : scan0;

        this.log(
          `[decode] partial scan(pos=1) words=${scan1.wordCount} raw=${scan1.rawSegments.length}` +
            ` | scan(pos=0) words=${scan0.wordCount} raw=${scan0.rawSegments.length}`,
        );

        const notice =
          `This does not appear to be a valid WordBin payload. ` +
          `Partial scan using dictionary v${scanVersion} extracted ` +
          `${best.wordCount} word(s); ${best.rawSegments.length} byte ` +
          `sequence(s) had no dictionary match and are shown as [0xXX] markers.`;

        return {
          text: best.text,
          isWordBin: false,
          detectedFormat,
          rawSegments: best.rawSegments,
          notice,
        };
      } catch {
        /* fall through to plain UTF-8 */
      }
    }

    // ── Step 4: plain UTF-8 last resort ───────────────────────────────────────
    const notice =
      `Could not decode with any available dictionary ` +
      `(tried: ${availableVersions.join(", ") || "none"}). ` +
      `Falling back to UTF-8 text decoding.`;
    this.log(`[decode] ${notice}`);
    return {
      text: new TextDecoder("utf-8", { fatal: false }).decode(buffer),
      isWordBin: false,
      detectedFormat,
      notice,
    };
  }

  // ── Private: greedy linear decode ────────────────────────────────────────────

  /**
   * O(n) longest-match-first decode. Returns null if any byte has no match.
   * This is the fast path; tryDecode is used as a backtracking fallback.
   */
  private greedyDecode(
    buffer: Uint8Array,
    startPos: number,
    reverseMap: Map<string, string>,
    sortedIdLengths: number[],
  ): string | null {
    const words: string[] = [];
    let pos = startPos;

    while (pos < buffer.length) {
      if (buffer[pos] === LITERAL) {
        const { value: byteLen, bytesRead } = decodeVarint(buffer, pos + 1);
        if (byteLen > 1_000_000 || byteLen < 0) return null;
        const start = pos + 1 + bytesRead;
        const end = start + byteLen;
        if (end > buffer.length) return null;
        words.push(utf8Decode(buffer.subarray(start, end)));
        pos = end;
        continue;
      }

      let matched = false;
      for (const len of sortedIdLengths) {
        if (pos + len > buffer.length) continue;
        const key = toHex(buffer.subarray(pos, pos + len));
        if (reverseMap.has(key)) {
          words.push(reverseMap.get(key)!);
          pos += len;
          matched = true;
          break;
        }
      }
      if (!matched) return null;
    }

    return words.join(" ");
  }

  // ── Private: partial / best-effort scan ──────────────────────────────────────

  /**
   * Scans through the buffer extracting any recognised dictionary words.
   * Unrecognised bytes are collected as raw segments and rendered as [0xXX].
   * Always consumes the entire buffer — never returns null.
   */
  private partialScan(
    buffer: Uint8Array,
    startPos: number,
    reverseMap: Map<string, string>,
    sortedIdLengths: number[],
  ): { text: string; wordCount: number; rawSegments: string[] } {
    const parts: string[] = [];
    const rawSegments: string[] = [];
    let wordCount = 0;
    let pos = startPos;

    while (pos < buffer.length) {
      // Try LITERAL token
      if (buffer[pos] === LITERAL && pos + 1 < buffer.length) {
        try {
          const { value: byteLen, bytesRead } = decodeVarint(buffer, pos + 1);
          if (byteLen > 0 && byteLen <= 1_000_000) {
            const start = pos + 1 + bytesRead;
            const end = start + byteLen;
            if (end <= buffer.length) {
              const word = utf8Decode(buffer.subarray(start, end));
              parts.push(word);
              wordCount++;
              pos = end;
              continue;
            }
          }
        } catch {
          /* malformed varint — treat as raw byte */
        }
      }

      // Try dictionary IDs (longest first)
      let matched = false;
      for (const len of sortedIdLengths) {
        if (pos + len > buffer.length) continue;
        const key = toHex(buffer.subarray(pos, pos + len));
        if (reverseMap.has(key)) {
          parts.push(reverseMap.get(key)!);
          wordCount++;
          pos += len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // No match — emit this byte as a hex marker and advance by 1
        const marker = `[0x${buffer[pos].toString(16).padStart(2, "0")}]`;
        parts.push(marker);
        rawSegments.push(marker);
        this.log(
          `[decode] partial scan: no match at pos=${pos} byte=${buffer[pos]}`,
        );
        pos++;
      }
    }

    return { text: parts.join(" "), wordCount, rawSegments };
  }

  // ── Private: backtracking decode ─────────────────────────────────────────────

  private tryDecode(
    pos: number,
    buffer: Uint8Array,
    reverseMap: Map<string, string>,
    result: string[],
    depth: number,
    sortedIdLengths: number[],
  ): string | null {
    if (pos === buffer.length) return result.join(" ");

    if (buffer[pos] === LITERAL) {
      const { value: byteLen, bytesRead } = decodeVarint(buffer, pos + 1);
      if (byteLen > 1_000_000 || byteLen < 0) return null;
      const start = pos + 1 + bytesRead;
      const end = start + byteLen;
      if (end > buffer.length) return null;
      result.push(utf8Decode(buffer.subarray(start, end)));
      const res = this.tryDecode(
        end,
        buffer,
        reverseMap,
        result,
        depth + 1,
        sortedIdLengths,
      );
      if (res !== null) return res;
      result.pop();
    }

    for (const len of sortedIdLengths) {
      if (pos + len > buffer.length) continue;
      const key = toHex(buffer.subarray(pos, pos + len));
      if (reverseMap.has(key)) {
        result.push(reverseMap.get(key)!);
        const res = this.tryDecode(
          pos + len,
          buffer,
          reverseMap,
          result,
          depth + 1,
          sortedIdLengths,
        );
        if (res !== null) return res;
        result.pop();
      }
    }

    return null;
  }
}
