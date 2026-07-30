import { LITERAL } from "../constants.js";
import {
  toHex,
  toBase64,
  encodeVarint,
  decodeVarint,
  utf8Encode,
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
  rawHex?: string;
  recoveryMode?: "strict" | "utf8" | "partial" | "empty";
  dictionaryVersion?: number;
  confidence?: number;
  segments?: DecodeSegment[];
  notice?: string;
  rawSegments?: string[];
}

export interface DecodeSegment {
  kind: "header" | "word" | "literal" | "utf8" | "raw";
  offset: number;
  length: number;
  hex: string;
  text?: string;
  word?: string;
  dictionaryVersion?: number;
}

export interface DecodeOptions {
  /** Limit best-effort recovery to one installed dictionary version. */
  dictVersion?: number;
}

interface DictionaryMaps {
  reverseMap: Map<string, string>;
  forwardMap: Map<string, Uint8Array>;
  sortedIdLengths: number[];
  idCountByLength: Map<number, number>;
}

interface RecoveryPath {
  score: number;
  matchedBytes: number;
  wordCount: number;
  segments: DecodeSegment[];
}

interface RecoveryCandidate extends RecoveryPath {
  dictionaryVersion?: number;
}

export class WordBin {
  private primaryDictVersion: number;
  private log: (...args: any[]) => void;
  private mapsCache = new Map<number, Promise<DictionaryMaps>>();

  constructor(initialDict?: WordBinDictionary, options?: { debug?: boolean }) {
    this.primaryDictVersion = initialDict?.version ?? 1;
    this.log = options?.debug
      ? (...args: any[]) => console.log("[WordBin]", ...args)
      : () => {};

    if (initialDict) {
      this.mapsCache.set(
        initialDict.version,
        Promise.resolve(this.createMaps(initialDict)),
      );
    }
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

  private createMaps(dict: WordBinDictionary): DictionaryMaps {
    const reverseMap = new Map<string, string>();
    const forwardMap = new Map<string, Uint8Array>();
    const idLengths = new Set<number>();
    const idCountByLength = new Map<number, number>();

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
      idCountByLength.set(
        bytes.length,
        (idCountByLength.get(bytes.length) ?? 0) + 1,
      );
      reverseMap.set(hex, word);
      forwardMap.set(word, bytes);
    }

    return {
      reverseMap,
      forwardMap,
      sortedIdLengths: Array.from(idLengths).sort((a, b) => b - a),
      idCountByLength,
    };
  }

  private async getMapsForVersion(version: number): Promise<DictionaryMaps> {
    const cached = this.mapsCache.get(version);
    if (cached) return cached;

    const loading = loadDictionaryByVersion(version).then((dict) =>
      this.createMaps(dict),
    );
    this.mapsCache.set(version, loading);

    try {
      return await loading;
    } catch (error) {
      this.mapsCache.delete(version);
      throw error;
    }
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

  async decode(
    payload: Uint8Array | string,
    options: DecodeOptions = {},
  ): Promise<DecodeResult> {
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

    const rawHex = toHex(buffer);

    if (buffer.length < 1) {
      return {
        text: "",
        isWordBin: false,
        detectedFormat,
        rawHex,
        recoveryMode: "empty",
        confidence: 0,
        segments: [],
        notice: "Payload is empty - nothing to decode.",
      };
    }

    const installedVersions = await getAllAvailableDictionaryVersions();
    const availableVersions = Array.from(
      new Set([...installedVersions, ...this.mapsCache.keys()]),
    ).sort((a, b) => a - b);
    const versionByte = buffer[0];
    const versionIsHeader = availableVersions.includes(versionByte);

    this.log(
      `[decode] availableVersions=[${availableVersions.join(",")}] ` +
        `versionByte=${versionByte} isKnownHeader=${versionIsHeader}`,
    );

    // Strict streams require a known version byte, at least one token, and a
    // complete parse with that exact dictionary. Unknown bytes are never
    // discarded as if they were headers.
    if (versionIsHeader && buffer.length > 1) {
      try {
        const { reverseMap, sortedIdLengths } =
          await this.getMapsForVersion(versionByte);
        const strictText = this.greedyDecode(
          buffer,
          1,
          reverseMap,
          sortedIdLengths,
        );

        if (strictText !== null) {
          return {
            text: strictText,
            isWordBin: true,
            detectedFormat,
            rawHex,
            recoveryMode: "strict",
            dictionaryVersion: versionByte,
            confidence: 1,
          };
        }
      } catch {
        // Continue into lossless recovery below.
      }
    }

    // Keep readable UTF-8 as a candidate. A complete, high-confidence exact-ID
    // recovery may still be a better interpretation for a headerless stream.
    const utf8Text = this.decodeReadableUtf8(buffer);

    this.log(`[decode] strict parse failed - starting lossless recovery`);

    const recoveryVersions = versionIsHeader
      ? [versionByte]
      : options.dictVersion !== undefined
        ? [options.dictVersion]
        : availableVersions;
    const startPos = versionIsHeader ? 1 : 0;
    let best: RecoveryCandidate | null = null;

    for (const ver of recoveryVersions) {
      try {
        const maps = await this.getMapsForVersion(ver);
        const candidate: RecoveryCandidate = {
          ...this.partialScan(
            buffer,
            startPos,
            maps,
            ver,
            versionIsHeader && ver === versionByte,
          ),
          dictionaryVersion: ver,
        };

        if (best === null || this.isBetterRecovery(candidate, best)) {
          best = candidate;
        }
      } catch {
        // Missing optional dictionaries never make decode throw.
      }
    }

    if (best === null) {
      best = {
        score: 0,
        matchedBytes: 0,
        wordCount: 0,
        segments: [this.rawSegment(buffer, 0, buffer.length)],
      };
    }

    let segments = this.coalesceRawSegments(best.segments);
    if (versionIsHeader) {
      segments = [
        {
          kind: "header",
          offset: 0,
          length: 1,
          hex: toHex(buffer.subarray(0, 1)),
          dictionaryVersion: versionByte,
        },
        ...segments,
      ];
    }

    const matchedVersion =
      best.matchedBytes > 0 || versionIsHeader
        ? best.dictionaryVersion
        : undefined;
    const rawSegments = segments
      .filter((segment) => segment.kind === "raw")
      .map((segment) => `[hex:${segment.hex}]`);
    const confidence = this.recoveryConfidence(
      best,
      Math.max(0, buffer.length - startPos),
      versionIsHeader,
    );
    const dataLength = Math.max(0, buffer.length - startPos);
    const isStrongCompleteRecovery =
      best.matchedBytes === dataLength && confidence >= 0.75;

    if (utf8Text !== null && !isStrongCompleteRecovery) {
      return {
        text: utf8Text,
        isWordBin: false,
        detectedFormat,
        rawHex,
        recoveryMode: "utf8",
        confidence: 1,
        segments: [
          {
            kind: "utf8",
            offset: 0,
            length: buffer.length,
            hex: rawHex,
            text: utf8Text,
          },
        ],
        rawSegments: [],
        notice: "Payload is not WordBin. Exact UTF-8 text was recovered.",
      };
    }

    const notice =
      best.matchedBytes > 0 && matchedVersion !== undefined
        ? `Payload is not valid WordBin. Recovered ${best.matchedBytes} exact dictionary byte(s) with dictionary v${matchedVersion}; unmatched bytes are preserved as hex.`
        : "Payload is not WordBin. No exact dictionary IDs were found; original bytes are preserved as hex.";

    return {
      text: this.renderRecoveryText(segments),
      isWordBin: false,
      detectedFormat,
      rawHex,
      recoveryMode: "partial",
      dictionaryVersion: matchedVersion,
      confidence,
      segments,
      rawSegments,
      notice,
    };
  }

  private greedyDecode(
    buffer: Uint8Array,
    startPos: number,
    reverseMap: Map<string, string>,
    sortedIdLengths: number[],
  ): string | null {
    if (startPos >= buffer.length) return null;

    const solutions: Array<string[] | null> = Array(buffer.length + 1).fill(
      null,
    );
    solutions[buffer.length] = [];

    for (let pos = buffer.length - 1; pos >= startPos; pos--) {
      // A literal is one possible path, not an unconditional choice: some
      // legitimate dictionary IDs begin with the literal sentinel byte.
      const literal = this.readLiteral(buffer, pos);
      if (literal && solutions[literal.end] !== null) {
        solutions[pos] = [literal.text, ...solutions[literal.end]!];
      }

      if (solutions[pos] === null) {
        for (const len of sortedIdLengths) {
          const end = pos + len;
          if (end > buffer.length || solutions[end] === null) continue;
          const word = reverseMap.get(toHex(buffer.subarray(pos, end)));
          if (word) {
            solutions[pos] = [word, ...solutions[end]!];
            break;
          }
        }
      }
    }

    return solutions[startPos]?.join(" ") ?? null;
  }

  private partialScan(
    buffer: Uint8Array,
    startPos: number,
    maps: DictionaryMaps,
    dictionaryVersion: number,
    allowLiterals: boolean,
  ): RecoveryPath {
    const paths: Array<RecoveryPath | null> = Array(buffer.length + 1).fill(
      null,
    );
    paths[buffer.length] = {
      score: 0,
      matchedBytes: 0,
      wordCount: 0,
      segments: [],
    };

    for (let pos = buffer.length - 1; pos >= startPos; pos--) {
      const rawSuffix = paths[pos + 1]!;
      let best: RecoveryPath = {
        ...rawSuffix,
        segments: [this.rawSegment(buffer, pos, pos + 1), ...rawSuffix.segments],
      };

      if (allowLiterals) {
        const literal = this.readLiteral(buffer, pos);
        const suffix = literal ? paths[literal.end] : null;
        if (literal && suffix) {
          const length = literal.end - pos;
          const candidate: RecoveryPath = {
            score: suffix.score + 16 + literal.byteLength * 2,
            matchedBytes: suffix.matchedBytes + length,
            wordCount: suffix.wordCount + 1,
            segments: [
              {
                kind: "literal",
                offset: pos,
                length,
                hex: toHex(buffer.subarray(pos, literal.end)),
                text: literal.text,
                dictionaryVersion,
              },
              ...suffix.segments,
            ],
          };
          if (this.isBetterRecovery(candidate, best)) best = candidate;
        }
      }

      for (const len of maps.sortedIdLengths) {
        const end = pos + len;
        if (end > buffer.length || paths[end] === null) continue;
        const word = maps.reverseMap.get(toHex(buffer.subarray(pos, end)));
        if (!word) continue;

        const suffix = paths[end]!;
        const matchScore = this.wordMatchScore(
          len,
          maps.idCountByLength.get(len) ?? 1,
        );
        if (matchScore <= 0) continue;
        const candidate: RecoveryPath = {
          score: suffix.score + matchScore,
          matchedBytes: suffix.matchedBytes + len,
          wordCount: suffix.wordCount + 1,
          segments: [
            {
              kind: "word",
              offset: pos,
              length: len,
              hex: toHex(buffer.subarray(pos, end)),
              word,
              dictionaryVersion,
            },
            ...suffix.segments,
          ],
        };

        if (this.isBetterRecovery(candidate, best)) best = candidate;
      }

      paths[pos] = best;
    }

    return (
      paths[startPos] ?? {
        score: 0,
        matchedBytes: 0,
        wordCount: 0,
        segments: [],
      }
    );
  }

  private readLiteral(
    buffer: Uint8Array,
    pos: number,
  ): { text: string; end: number; byteLength: number } | null {
    if (buffer[pos] !== LITERAL) return null;

    try {
      const { value: byteLength, bytesRead } = decodeVarint(buffer, pos + 1);
      if (byteLength <= 0) return null;
      const canonicalLength = encodeVarint(byteLength);
      if (
        canonicalLength.length !== bytesRead ||
        toHex(canonicalLength) !==
          toHex(buffer.subarray(pos + 1, pos + 1 + bytesRead))
      ) {
        return null;
      }
      const start = pos + 1 + bytesRead;
      const end = start + byteLength;
      if (end > buffer.length) return null;
      const text = this.decodeUtf8Exact(buffer.subarray(start, end));
      return text === null ? null : { text, end, byteLength };
    } catch {
      return null;
    }
  }

  private decodeUtf8Exact(buffer: Uint8Array): string | null {
    try {
      const text = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(buffer);
      return toHex(utf8Encode(text)) === toHex(buffer) ? text : null;
    } catch {
      return null;
    }
  }

  private decodeReadableUtf8(buffer: Uint8Array): string | null {
    const text = this.decodeUtf8Exact(buffer);
    if (text === null || text.length === 0) return null;

    // Tabs and line breaks are readable; other C0/C1 controls indicate binary.
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(
      text,
    )
      ? null
      : text;
  }

  private rawSegment(
    buffer: Uint8Array,
    start: number,
    end: number,
  ): DecodeSegment {
    return {
      kind: "raw",
      offset: start,
      length: end - start,
      hex: toHex(buffer.subarray(start, end)),
    };
  }

  private coalesceRawSegments(segments: DecodeSegment[]): DecodeSegment[] {
    const merged: DecodeSegment[] = [];

    for (const segment of segments) {
      const previous = merged[merged.length - 1];
      if (
        segment.kind === "raw" &&
        previous?.kind === "raw" &&
        previous.offset + previous.length === segment.offset
      ) {
        previous.length += segment.length;
        previous.hex += segment.hex;
      } else {
        merged.push({ ...segment });
      }
    }

    return merged;
  }

  private renderRecoveryText(segments: DecodeSegment[]): string {
    return segments
      .map((segment) => {
        switch (segment.kind) {
          case "header":
            return `[header:v${segment.dictionaryVersion}]`;
          case "word":
            return segment.word!;
          case "literal":
          case "utf8":
            return segment.text!;
          case "raw":
            return `[hex:${segment.hex}]`;
        }
      })
      .join(" ");
  }

  private wordMatchScore(length: number, idCount: number): number {
    // Reward exact-match information while discounting dense dictionaries and
    // the freedom to infer another word. Weak v2 two-byte coincidences have a
    // negative score and remain raw instead of becoming random word salad.
    return length * 8 - Math.log2(Math.max(1, idCount)) - 4;
  }

  private isBetterRecovery(
    candidate: RecoveryPath,
    current: RecoveryPath,
  ): boolean {
    if (Math.abs(candidate.score - current.score) > 1e-9) {
      return candidate.score > current.score;
    }
    if (candidate.matchedBytes !== current.matchedBytes) {
      return candidate.matchedBytes > current.matchedBytes;
    }
    if (candidate.wordCount !== current.wordCount) {
      return candidate.wordCount < current.wordCount;
    }
    return false;
  }

  private recoveryConfidence(
    recovery: RecoveryPath,
    dataLength: number,
    hasHeader: boolean,
  ): number {
    if (recovery.matchedBytes === 0 || dataLength === 0) return 0;
    const coverage = recovery.matchedBytes / dataLength;
    const evidenceStrength = Math.min(
      1,
      recovery.score / (recovery.matchedBytes * 3),
    );
    const contextFactor = hasHeader ? 1 : 0.9;
    return Math.round(coverage * evidenceStrength * contextFactor * 100) / 100;
  }

}
