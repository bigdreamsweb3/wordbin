import { LITERAL } from "./constants.js";
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
import { buildDictionary } from "./dict/builder";
import {
  loadDictionaryByVersion,
  loadLatestDictionary,
} from "./dict/dictionary-loader.js";

interface DecodeMaps {
  reverseMap: Map<string, string>;
  forwardMap: Map<string, Uint8Array>;
  idLengths: number[];
}

export class WordBin {
  private primaryDictVersion: number;
  private log: (...args: any[]) => void;
  private mapCache: Map<number, DecodeMaps> = new Map();

  constructor(initialDict?: WordBinDictionary, options?: { debug?: boolean }) {
    this.primaryDictVersion = initialDict?.version ?? 2;
    this.log = options?.debug
      ? (...args) => console.log("[WordBin]", ...args)
      : () => {};
  }

  static async createFromWords(words: string[]): Promise<WordBin> {
    console.warn("Building dictionary from scratch – consider pre-built files");
    const dict = await buildDictionary(words);
    return new WordBin(dict);
  }

  static async createFromJson(dictJson: WordBinDictionary): Promise<WordBin> {
    return new WordBin(dictJson);
  }

  static async create(options?: { debug?: boolean }): Promise<WordBin> {
    const latestDict = await loadLatestDictionary();
    return new WordBin(latestDict, options);
  }

  private async getMapsForVersion(version: number): Promise<DecodeMaps> {
    // Check cache first
    if (this.mapCache.has(version)) {
      return this.mapCache.get(version)!;
    }

    const dict = await loadDictionaryByVersion(version);

    const reverseMap = new Map<string, string>();
    const forwardMap = new Map<string, Uint8Array>();
    const idLengths = new Set<number>();

    for (const [hex, words] of Object.entries(dict.words)) {
      if (!words.length) continue;
      if (words.length > 1)
        throw new Error(
          `Dictionary corruption: ID ${hex} maps to multiple words`,
        );

      const word = words[0];
      const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
      idLengths.add(bytes.length);

      reverseMap.set(hex, word);
      forwardMap.set(word, bytes);
    }

    const sortedIdLengths = Array.from(idLengths).sort((a, b) => b - a);
    const maps: DecodeMaps = {
      reverseMap,
      forwardMap,
      idLengths: sortedIdLengths,
    };

    // Cache it
    this.mapCache.set(version, maps);
    return maps;
  }

  async encode(
    text: string | EncodeResult | Uint8Array,
    options?: { dictVersion?: number },
  ): Promise<EncodeResult> {
    let textStr: string;
    if (typeof text === "string") textStr = text;
    else if (text instanceof Uint8Array) textStr = toBase64(text);
    else textStr = text.encodedBase64;

    if (!textStr.trim())
      return {
        originalText: "",
        dictVersion: 0,
        encoded: new Uint8Array(0),
        payload: "",
        encodedBase64: "",
        originalBytes: 0,
        encodedBytes: 0,
        bytesSaved: 0,
        ratioPercent: 100,
      };

    const words = textStr.split(/\s+/).filter(Boolean);
    const useVersion = options?.dictVersion ?? this.primaryDictVersion;

    const header = new Uint8Array([useVersion]);
    const chunks: Uint8Array[] = [header];

    const { forwardMap } = await this.getMapsForVersion(useVersion);

    for (const w of words) {
      const id = forwardMap.get(w);
      if (id) chunks.push(id);
      else {
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
    const base64Result = toBase64(result);

    return {
      originalText: textStr,
      dictVersion: useVersion,
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
    const buffer = typeof data === "string" ? fromBase64(data) : data;

    if (buffer.length < 1) {
      throw new Error("Data too short");
    }

    const version = buffer[0];
    const { reverseMap, idLengths } = await this.getMapsForVersion(version);

    // Use iterative approach with explicit stack instead of recursion
    interface StackFrame {
      pos: number;
      words: string[];
      idLenIndex: number;
    }

    const stack: StackFrame[] = [{ pos: 1, words: [], idLenIndex: 0 }];
    const maxIdLen = idLengths[0] || 4;

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const { pos, words, idLenIndex } = frame;

      // Successfully decoded entire buffer
      if (pos >= buffer.length) {
        return words.join(" ");
      }

      // Try literal mode
      if (buffer[pos] === LITERAL) {
        const { value: len, bytesRead } = decodeVarint(buffer, pos + 1);
        const start = pos + 1 + bytesRead;
        const end = start + len;

        if (end > buffer.length) {
          stack.pop();
          continue;
        }

        const word = utf8Decode(buffer.subarray(start, end));
        frame.words.push(word);
        frame.pos = end;
        frame.idLenIndex = 0;
        continue;
      }

      // Try dictionary mode with remaining ID lengths
      if (idLenIndex < idLengths.length) {
        const idLen = idLengths[idLenIndex];
        frame.idLenIndex++;

        if (pos + idLen <= buffer.length) {
          const slice = buffer.subarray(pos, pos + idLen);
          const key = toHex(slice);
          const word = reverseMap.get(key);

          if (word) {
            // Found a match - push new frame
            stack.push({
              pos: pos + idLen,
              words: [...words, word],
              idLenIndex: 0,
            });
          }
        }
        continue;
      }

      // No more ID lengths to try - backtrack
      stack.pop();
    }

    throw new Error(
      "No valid decode path found — possible corruption or dictionary mismatch",
    );
  }
}
