import { LITERAL } from "../constants.js";
import {
  toHex,
  toBase64,
  fromBase64,
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
} from "../dict/dictionary-loader.js";
import { toHexString, fromHexString } from "./binary-payload.js";
import { SimpleLatinShortener } from "./comp/latin1-compressor.js";
import bs58 from "bs58";

export class WordBin {
  private primaryDictVersion: number;
  private log: (...args: any[]) => void;

  constructor(initialDict?: WordBinDictionary, options?: { debug?: boolean }) {
    this.primaryDictVersion = initialDict?.version ?? 2;
    this.log = options?.debug
      ? (...args) => console.log("[WordBin]", ...args)
      : () => {};
  }

  static async createFromWords(words: string[]): Promise<WordBin> {
    console.warn(
      "Building dictionary from scratch – consider using pre-built files",
    );
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
      const bytes = Buffer.from(hex, "hex"); // Buffer is a Uint8Array
      idLengths.add(bytes.length);

      reverseMap.set(hex, word);
      forwardMap.set(word, bytes);
    }

    const sortedIdLengths = Array.from(idLengths).sort((a, b) => b - a); // longest first

    return { reverseMap, forwardMap, sortedIdLengths };
  }

  async encode(
    text: string | EncodeResult | Uint8Array,
    options?: { dictVersion?: number; debug?: boolean },
  ): Promise<EncodeResult> {
    let textStr: string;
    if (typeof text === "string") {
      textStr = text;
    } else if (text instanceof Uint8Array) {
      textStr = toBase64(text);
    } else {
      textStr = text.encodedBase64;
    }

    const trimmed = textStr.trim();
    if (!trimmed) {
      return {
        originalText: "",
        dictVersion: this.primaryDictVersion,
        encoded: new Uint8Array(0),
        payload: "",
        binaryChars: "",
        encodedBase64: "",
        hexPayload: "",
        base58Payload: "",
        originalBytes: 0,
        encodedBytes: 0,
        bytesSaved: 0,
        ratioPercent: 100,
      };
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    const useVersion = options?.dictVersion ?? this.primaryDictVersion;

    const header = new Uint8Array([useVersion]);
    const chunks: Uint8Array[] = [header];

    const { forwardMap } = await this.getMapsForVersion(useVersion);

    for (const w of words) {
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

    const base64String = toBase64(result);

    let hex = "";
    hex = toHexString(result);

    let hexToASCIIChars = "";
    for (let i = 0; i < hex.length; i += 2) {
      hexToASCIIChars += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }

    this.log(
      "Real hexToASCIIChars (escaped):",
      JSON.stringify(hexToASCIIChars),
    );

    // After creating hexToASCIIChars
    this.log("Raw hexToASCIIChars length (chars):", hexToASCIIChars.length);
    this.log(
      "Raw hexToASCIIChars UTF-8 bytes  :",
      new TextEncoder().encode(hexToASCIIChars).length,
    );

    const l_compressor = new SimpleLatinShortener();

    this.log("hexToASCIIChars as string:", hexToASCIIChars);
    const compressedLatin = l_compressor.shorten(hexToASCIIChars);
    // hex = toHexString(compressedLatin);

    // Your hex string from Latin-1 conversion
    const hexLatin1 = Array.from(hexToASCIIChars)
      .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");

    // Step 1: Convert hex to bytes
    const bytes = Uint8Array.from(
      hexLatin1.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)),
    );

    // Step 2: Encode to Base58
    const base58 = bs58.encode(bytes);

    // Return the compressed version
    return {
      originalText: textStr,
      dictVersion: useVersion,

      encoded: result,
      payload: compressedLatin,
      binaryChars: hexToASCIIChars,
      encodedBase64: base64String,
      hexPayload: hexLatin1,
      base58Payload: base58,

      originalBytes,
      encodedBytes: new TextEncoder().encode(compressedLatin).length,
      bytesSaved:
        originalBytes - new TextEncoder().encode(compressedLatin).length,
      ratioPercent:
        Math.round(
          (new TextEncoder().encode(compressedLatin).length / originalBytes) *
            10000,
        ) / 100,
    };
  }

  async decode(payload: Uint8Array | string): Promise<string> {
    this.log("[decode] === Decoding process started ===");
    this.log(
      "[decode] Payload type:",
      payload instanceof Uint8Array ? "Uint8Array" : "string",
    );
    this.log(
      "[decode] Payload length:",
      payload instanceof Uint8Array ? payload.length : payload.length,
    );

    let buffer: Uint8Array;

    if (payload instanceof Uint8Array) {
      this.log("[decode] Using legacy raw Uint8Array");
      buffer = payload;
    } else {
      this.log("[decode] Treating payload as shortened latin string");
      const shortener = new SimpleLatinShortener();

      this.log("[decode] Shortened input (escaped):", JSON.stringify(payload));
      this.log("[decode] Shortened input length:", payload.length);

      // Restore original latin1/binary string
      const restoredLatin = shortener.restore(payload);
      this.log("[decode] Restored latin string length:", restoredLatin.length);
      this.log(
        "[decode] Restored latin string (escaped):",
        JSON.stringify(restoredLatin),
      );

      // Convert back to bytes
      const restoredBytes = new Uint8Array(restoredLatin.length);
      for (let i = 0; i < restoredLatin.length; i++) {
        const code = restoredLatin.charCodeAt(i);
        if (code > 0xff) {
          console.error(
            `[decode] ERROR: Invalid byte >255 at position ${i}: U+${code.toString(16)}`,
          );
          throw new Error(
            `Restored string contains invalid byte value >255 at position ${i}: U+${code.toString(16)}`,
          );
        }
        restoredBytes[i] = code;
      }

      buffer = restoredBytes;
      this.log("[decode] Restored buffer length:", buffer.length);
      this.log(
        "[decode] First 20 restored bytes:",
        Array.from(buffer.slice(0, 20)),
      );
    }

    if (buffer.length < 1) {
      console.error("[decode] ERROR: Buffer too short (<1 byte)");
      throw new Error("Data too short to contain version byte");
    }

    const version = buffer[0];
    this.log("[decode] Detected version byte:", version);
    let pos = 1;

    this.log("[decode] Loading maps for version:", version);
    const { reverseMap, sortedIdLengths } =
      await this.getMapsForVersion(version);
    this.log("[decode] Loaded reverseMap size:", reverseMap.size);
    this.log("[decode] Sorted ID lengths:", sortedIdLengths);

    const result: string[] = [];
    this.log("[decode] Starting tryDecode at position:", pos);

    const decoded = this.tryDecode(
      pos,
      buffer,
      reverseMap,
      result,
      0,
      sortedIdLengths,
    );

    if (decoded === null) {
      console.error("[decode] ERROR: tryDecode returned null");
      console.error("[decode] Final result array (before fail):", result);
      throw new Error(
        "Decode failed — possible data corruption, wrong dictionary version, or unsupported format",
      );
    }

    this.log("[decode] Decoding succeeded. Final words:", result);
    this.log("[decode] === Decoding process completed ===");
    return decoded;
  }

  private tryDecode(
    pos: number,
    buffer: Uint8Array,
    reverseMap: Map<string, string>,
    result: string[],
    depth: number,
    sortedIdLengths: number[],
  ): string | null {
    this.log(
      `[tryDecode] depth=${depth}, pos=${pos}, buffer remaining=${buffer.length - pos}`,
    );

    if (pos === buffer.length) {
      this.log("[tryDecode] Reached end of buffer → success");
      return result.join(" ");
    }

    // 1. Try literal block
    if (buffer[pos] === LITERAL) {
      this.log(`[tryDecode] Found LITERAL marker at pos=${pos}`);
      const { value: byteLen, bytesRead } = decodeVarint(buffer, pos + 1);
      this.log(
        `[tryDecode] Literal length: ${byteLen}, varint bytes read: ${bytesRead}`,
      );

      if (byteLen > 1_000_000 || byteLen < 0) {
        console.warn(
          `[tryDecode] Suspicious literal length ${byteLen} → aborting path`,
        );
        return null;
      }

      const start = pos + 1 + bytesRead;
      const end = start + byteLen;

      if (end > buffer.length) {
        console.warn(
          `[tryDecode] Literal end ${end} > buffer length ${buffer.length} → aborting path`,
        );
        return null;
      }

      const literalBytes = buffer.subarray(start, end);
      const word = utf8Decode(literalBytes);
      this.log(
        `[tryDecode] Decoded literal word: "${word}" (length ${word.length})`,
      );

      result.push(word);
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
      this.log("[tryDecode] Backtracked from literal path");
    }

    // 2. Try dictionary IDs — longest first
    this.log("[tryDecode] Trying dictionary IDs...");
    for (const len of sortedIdLengths) {
      if (pos + len > buffer.length) {
        this.log(
          `[tryDecode] ID length ${len} too big for remaining ${buffer.length - pos} bytes → skip`,
        );
        continue;
      }

      const slice = buffer.subarray(pos, pos + len);
      const key = toHex(slice);
      this.log(`[tryDecode] Trying ID len=${len}, key=${key}`);

      if (reverseMap.has(key)) {
        const word = reverseMap.get(key)!;
        this.log(`[tryDecode] Found word: "${word}" for key ${key}`);

        result.push(word);
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
        this.log("[tryDecode] Backtracked from dictionary path");
      }
    }

    this.log("[tryDecode] No valid continuation found at pos", pos);
    return null;
  }

  // private tryDecode(
  //   pos: number,
  //   buffer: Uint8Array,
  //   reverseMap: Map<string, string>,
  //   result: string[],
  //   depth: number,
  //   sortedIdLengths: number[],
  // ): string | null {
  //   if (pos === buffer.length) {
  //     return result.join(" ");
  //   }

  //   // 1. Try literal block
  //   if (buffer[pos] === LITERAL) {
  //     const { value: byteLen, bytesRead } = decodeVarint(buffer, pos + 1);

  //     // Basic sanity check — very large literals are suspicious
  //     if (byteLen > 1_000_000 || byteLen < 0) {
  //       return null;
  //     }

  //     const start = pos + 1 + bytesRead;
  //     const end = start + byteLen;

  //     if (end > buffer.length) {
  //       return null;
  //     }

  //     const literalBytes = buffer.subarray(start, end);
  //     const word = utf8Decode(literalBytes);

  //     result.push(word);
  //     const res = this.tryDecode(
  //       end,
  //       buffer,
  //       reverseMap,
  //       result,
  //       depth + 1,
  //       sortedIdLengths,
  //     );
  //     if (res !== null) return res;
  //     result.pop();
  //   }

  //   // 2. Try dictionary IDs — longest first
  //   for (const len of sortedIdLengths) {
  //     if (pos + len > buffer.length) continue;

  //     const slice = buffer.subarray(pos, pos + len);
  //     const key = toHex(slice);

  //     if (reverseMap.has(key)) {
  //       const word = reverseMap.get(key)!;
  //       result.push(word);

  //       const res = this.tryDecode(
  //         pos + len,
  //         buffer,
  //         reverseMap,
  //         result,
  //         depth + 1,
  //         sortedIdLengths,
  //       );
  //       if (res !== null) return res;

  //       result.pop();
  //     }
  //   }

  //   // No valid continuation found on this path
  //   return null;
  // }
}
