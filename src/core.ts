import { MAGIC, LITERAL } from "./constants.js";
import { generateWordId } from "./core/id.js";
import {
  toHex,
  toBase64,
  fromBase64,
  encodeVarint,
  decodeVarint,
  utf8Encode,
  utf8Decode,
} from "./utils/buffer.js";
import type { EncodeResult, WordBinDictionary } from "./types";
import { buildDictionary } from "./dictionary.js";
import {
  loadDictionaryByVersion,
  loadLatestDictionary,
} from "./dictionary-loader.js";

export class WordBin {
  private primaryDictVersion: number;
  // private debug: boolean;

  constructor(initialDict?: WordBinDictionary, options?: { debug?: boolean }) {
    this.primaryDictVersion = initialDict?.version ?? 2;
    this.log = options?.debug
      ? (...args) => console.log("[WordBin]", ...args)
      : () => {};
  }

  private log: (...args: any[]) => void;

  static async createFromWords(words: string[]): Promise<WordBin> {
    console.warn("Building dictionary from scratch – consider pre-built files");
    const dict = await buildDictionary(words);
    return new WordBin(dict);
  }

  static async createFromJson(dictJson: WordBinDictionary): Promise<WordBin> {
    return new WordBin(dictJson);
  }

  static async create(): Promise<WordBin> {
    const latestDict = await loadLatestDictionary();
    return new WordBin(latestDict);
  }

  private async getReverseMapForVersion(
    version: number,
  ): Promise<Map<string, string>> {
    const dict = await loadDictionaryByVersion(version);
    const reverseMap = new Map<string, string>();
    for (const [hex, words] of Object.entries(dict.words)) {
      if (words.length > 0) reverseMap.set(hex, words[0]);
    }
    return reverseMap;
  }

  async encode(
    text: string | EncodeResult | Uint8Array,
    options: { dictVersion?: number } = {},
  ): Promise<EncodeResult> {
    let textStr: string;
    if (typeof text === "string") textStr = text;
    else if (text instanceof Uint8Array) textStr = toBase64(text);
    else textStr = text.encodedBase64;

    if (!textStr.trim()) {
      return {
        originalText: "",
        encoded: new Uint8Array(0),
        payload: "",
        encodedBase64: "",
        originalBytes: 0,
        encodedBytes: 0,
        bytesSaved: 0,
        ratioPercent: 100,
      };
    }

    const words = textStr.split(/\s+/).filter(Boolean);
    this.log(`[encode] Input words (${words.length}):`, words);

    const useVersion = options.dictVersion ?? this.primaryDictVersion;
    this.log(`[encode] Using dictionary version: ${useVersion}`);

    // ──────────────────────────────────────────────
    // Header creation
    // ──────────────────────────────────────────────
    const header = new Uint8Array([MAGIC[0], MAGIC[1], useVersion]);
    this.log(`[encode] Header bytes: [${[...header].join(", ")}]`);
    this.log(`[encode] Header hex: ${toHex(header)}`);
    this.log(
      `[encode] Header as text (non-printable chars expected): "${new TextDecoder().decode(header)}"`,
    );

    const chunks: Uint8Array[] = [header];

    const reverseMap = await this.getReverseMapForVersion(useVersion);
    this.log(`[encode] Reverse map loaded — size: ${reverseMap.size} entries`);

    // ──────────────────────────────────────────────
    // Process each word → show ID mapping
    // ──────────────────────────────────────────────
    this.log("[encode] Word → ID mapping:");

    for (const w of words) {
      const id = await generateWordId(w); // Uint8Array (usually 2–4 bytes)
      const key = toHex(id); // hex string for lookup

      this.log(`  "${w}" → ID bytes: [${[...id].join(", ")}] | hex: ${key}`);

      if (reverseMap.has(key)) {
        const mappedWord = reverseMap.get(key);
        this.log(`    → Found in dictionary → using ${id.length}-byte ID`);
        chunks.push(id);
      } else {
        const utf8 = utf8Encode(w);
        const lenVarint = encodeVarint(utf8.length);
        this.log(`    → NOT in dictionary → literal mode`);
        this.log(
          `      Literal length varint bytes: [${[...lenVarint].join(", ")}] (value = ${utf8.length})`,
        );
        this.log(`      Word UTF-8 bytes length: ${utf8.length}`);

        const out = new Uint8Array(1 + lenVarint.length + utf8.length);
        out[0] = LITERAL;
        out.set(lenVarint, 1);
        out.set(utf8, 1 + lenVarint.length);

        this.log(`      Literal chunk bytes: [${[...out].join(", ")}]`);
        chunks.push(out);
      }
    }

    // ──────────────────────────────────────────────
    // Final assembly
    // ──────────────────────────────────────────────
    const totalLength = chunks.reduce((n, c) => n + c.length, 0);
    const result = new Uint8Array(totalLength);

    this.log(`[encode] Total encoded length: ${totalLength} bytes`);

    let off = 0;
    chunks.forEach((chunk, i) => {
      result.set(chunk, off);
      off += chunk.length;
      this.log(
        `  Chunk ${i}: ${chunk.length} bytes → offset ${off - chunk.length}`,
      );
    });

    this.log(
      `[encode] Final encoded bytes (first 32): [${[...result.subarray(0, Math.min(32, result.length))].join(", ")}]`,
    );

    const originalBytes = new TextEncoder().encode(textStr).length;

    const base64Result = toBase64(result);
    this.log(`[encode] Base64 starts with: ${base64Result.slice(0, 12)}...`);

    return {
      originalText: textStr,
      encoded: result,
      payload: base64Result,
      encodedBase64: base64Result,
      originalBytes,
      encodedBytes: totalLength,
      bytesSaved: originalBytes - totalLength,
      ratioPercent:
        totalLength === 0
          ? 100
          : Math.round((totalLength / originalBytes) * 100),
    };
  }

  async decode(data: Uint8Array | string): Promise<string> {
    let buffer: Uint8Array;
    if (typeof data === "string") {
      buffer = fromBase64(data);
    } else {
      buffer = data;
    }

    if (buffer.length < 3) {
      throw new Error("Data too short");
    }

    if (buffer[0] !== MAGIC[0] || buffer[1] !== MAGIC[1]) {
      throw new Error("Invalid magic bytes");
    }

    const version = buffer[2];
    let pos = 3; // start right after version byte

    const reverseMap = await this.getReverseMapForVersion(version);

    const result: string[] = [];

    while (pos < buffer.length) {
      let matched = false;

      // Literal block
      if (buffer[pos] === LITERAL) {
        const { value: byteLen, bytesRead } = decodeVarint(buffer, pos + 1);
        const start = pos + 1 + bytesRead;
        const end = start + byteLen;

        if (end > buffer.length) {
          throw new Error("Truncated literal block");
        }

        const word = utf8Decode(buffer.subarray(start, end));
        result.push(word);
        pos = end;
        matched = true;
      }

      // Known word reference
      if (!matched) {
        for (const len of [4, 3, 2]) {
          if (pos + len > buffer.length) continue;
          const slice = buffer.subarray(pos, pos + len);
          const key = toHex(slice);

          if (reverseMap.has(key)) {
            result.push(reverseMap.get(key)!);
            pos += len;
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        result.push(`[??:${buffer[pos].toString(16).padStart(2, "0")}]`);
        pos += 1;
      }
    }

    return result.join(" ");
  }
}
