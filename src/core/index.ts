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
import { detectAndConvert, type PayloadFormat } from "./format-detection.js";
import { bytesToHex } from "./helpers.js";
// Bin21 removed: hex is primary payload

export interface DecodeResult {
  text: string;
  isWordBin: boolean;
  detectedFormat: PayloadFormat;
  notice?: string;
  rawSegments?: string[];
}

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

    const hexPayload = bytesToHex(result);
    const base64Payload = toBase64(result);
    const base58Payload = bs58.encode(result);

    // `payload` is the primary representation (hex). encodedBytes is
    // reported as number of raw bytes = hex length / 2.
    const encodedBytes = Math.floor(hexPayload.length / 2);

    return {
      originalText: textStr,
      dictVersion: useVersion,
      encoded: result,
      payload: hexPayload,
      hexPayload,
      base64Payload,
      base58Payload,
      originalBytes,
      encodedBytes,
      bytesSaved: originalBytes - encodedBytes,
      ratioPercent: Math.round((encodedBytes / originalBytes) * 10000) / 100,
    };
  }

  async decode(payload: Uint8Array | string): Promise<DecodeResult> {
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

    const availableVersions = await getAllAvailableDictionaryVersions();
    const versionByte = buffer[0];
    const versionIsHeader = availableVersions.includes(versionByte);

    this.log(
      `[decode] availableVersions=[${availableVersions.join(",")}] ` +
        `versionByte=${versionByte} isKnownHeader=${versionIsHeader}`,
    );

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

      const r1 = this.greedyDecode(buffer, 1, reverseMap, sortedIdLengths);
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

      const r0 = this.greedyDecode(buffer, 0, reverseMap, sortedIdLengths);
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

    this.log(`[decode] strict parse failed — falling back to partial scan`);

    if (availableVersions.length > 0) {
      const scanVersion = availableVersions[availableVersions.length - 1];
      try {
        const { reverseMap, sortedIdLengths } =
          await this.getMapsForVersion(scanVersion);

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
      } catch {}
    }

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
        // Guard against false positives: if the following bytes do not form a
        // valid varint (truncated or malformed), treat this as NOT a literal
        // and fall through to ID matching. This avoids misinterpreting an ID
        // byte that equals `LITERAL` as the start of a literal block.
        let byteLen: number;
        let bytesRead: number;
        try {
          ({ value: byteLen, bytesRead } = decodeVarint(buffer, pos + 1));
        } catch {
          // Not a valid varint — continue to ID matching below.
          byteLen = -1;
          bytesRead = 0;
        }

        if (byteLen > 0) {
          if (byteLen > 1_000_000 || byteLen < 0) return null;
          const start = pos + 1 + bytesRead;
          const end = start + byteLen;
          if (end > buffer.length) return null;
          words.push(utf8Decode(buffer.subarray(start, end)));
          pos = end;
          continue;
        }
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
        } catch {}
      }

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
      let byteLen: number;
      let bytesRead: number;
      try {
        ({ value: byteLen, bytesRead } = decodeVarint(buffer, pos + 1));
      } catch {
        byteLen = -1;
        bytesRead = 0;
      }
      if (byteLen > 0) {
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
