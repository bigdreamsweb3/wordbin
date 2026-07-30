import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { WordBin, type DecodeSegment } from "../src/index";
import type { WordBinDictionary } from "../src/types";

function segmentHex(segments: DecodeSegment[] | undefined): string {
  return (segments ?? []).map((segment) => segment.hex).join("");
}

describe("lossless decoding and recovery", () => {
  let wb: WordBin;

  beforeAll(async () => {
    const json = await readFile(
      new URL("../data/dict-v1-bip39.json", import.meta.url),
      "utf8",
    );
    wb = await WordBin.createFromJson(
      JSON.parse(json) as WordBinDictionary,
    );
  });

  it("backtracks across variable-length ID prefixes", async () => {
    const encoded = await wb.encode("lab acid", { dictVersion: 1 });

    expect(encoded.hexPayload).toBe("01a511ae5e");
    await expect(wb.decode(encoded.encoded)).resolves.toMatchObject({
      text: "lab acid",
      isWordBin: true,
      recoveryMode: "strict",
      dictionaryVersion: 1,
    });
  });

  it.each(["canyon", "frozen", "pumpkin", "radar", "snack", "warrior"])(
    "does not confuse the 0xff-prefixed ID for %s with a literal",
    async (word) => {
      const encoded = await wb.encode(word, { dictVersion: 1 });
      expect(encoded.encoded[1]).toBe(0xff);

      const decoded = await wb.decode(encoded.encoded);
      expect(decoded.text).toBe(word);
      expect(decoded.isWordBin).toBe(true);
    },
  );

  it.each([new Uint8Array([0xff]), new Uint8Array([0x01])])(
    "never accepts a header-only or unknown one-byte payload",
    async (payload) => {
      const result = await wb.decode(payload, { dictVersion: 1 });

      expect(result.isWordBin).toBe(false);
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.recoveryMode).toBe("partial");
      expect(result.rawHex).toBe(Buffer.from(payload).toString("hex"));
    },
  );

  it("returns readable UTF-8 with exact case and punctuation", async () => {
    const result = await wb.decode("48656c6c6f20576f726c6421");

    expect(result).toMatchObject({
      text: "Hello World!",
      isWordBin: false,
      detectedFormat: "hex",
      rawHex: "48656c6c6f20576f726c6421".toLowerCase(),
      recoveryMode: "utf8",
      confidence: 1,
    });
  });

  it("preserves every arbitrary binary byte without replacement characters", async () => {
    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02]);
    const expectedHex = Buffer.from(payload).toString("hex");
    const result = await wb.decode(payload, { dictVersion: 1 });

    expect(result.isWordBin).toBe(false);
    expect(result.recoveryMode).toBe("partial");
    expect(result.rawHex).toBe(expectedHex);
    expect(result.text).not.toContain("�");
    expect(segmentHex(result.segments)).toBe(expectedHex);
  });

  it("recovers exact IDs inside foreign bytes and keeps raw offsets", async () => {
    const payload = new Uint8Array([0xde, 0xdf, 0x86, 0x4c, 0xbe]);
    const result = await wb.decode(payload, { dictVersion: 1 });

    expect(result.isWordBin).toBe(false);
    expect(result.text).toBe("[hex:de] abandon [hex:be]");
    expect(result.segments).toEqual([
      { kind: "raw", offset: 0, length: 1, hex: "de" },
      {
        kind: "word",
        offset: 1,
        length: 3,
        hex: "df864c",
        word: "abandon",
        dictionaryVersion: 1,
      },
      { kind: "raw", offset: 4, length: 1, hex: "be" },
    ]);
    expect(segmentHex(result.segments)).toBe("dedf864cbe");
  });

  it("keeps headerless exact-ID recovery explicitly non-WordBin", async () => {
    const result = await wb.decode(new Uint8Array([0xdf, 0x86, 0x4c]), {
      dictVersion: 1,
    });

    expect(result).toMatchObject({
      text: "abandon",
      isWordBin: false,
      recoveryMode: "partial",
      dictionaryVersion: 1,
      rawHex: "df864c",
    });
  });

  it("rejects malformed literal UTF-8 and preserves its exact bytes", async () => {
    const payload = new Uint8Array([0x01, 0xff, 0x02, 0xc3, 0x28]);
    const expectedHex = Buffer.from(payload).toString("hex");
    const result = await wb.decode(payload);

    expect(result.isWordBin).toBe(false);
    expect(result.text).not.toContain("�");
    expect(result.rawHex).toBe(expectedHex);
    expect(segmentHex(result.segments)).toBe(expectedHex);
  });

  it("rejects non-canonical literal lengths", async () => {
    // Length 2 encoded as 0x82 0x00 instead of canonical 0x02.
    const payload = new Uint8Array([0x01, 0xff, 0x82, 0x00, 0x6f, 0x6b]);
    const expectedHex = Buffer.from(payload).toString("hex");
    const result = await wb.decode(payload);

    expect(result.isWordBin).toBe(false);
    expect(result.rawHex).toBe(expectedHex);
    expect(segmentHex(result.segments)).toBe(expectedHex);
  });

  it("round-trips Unicode literals through strict decoding", async () => {
    const encoded = await wb.encode("café 🚀", { dictVersion: 1 });
    const decoded = await wb.decode(encoded.encoded);

    expect(decoded.text).toBe("café 🚀");
    expect(decoded.isWordBin).toBe(true);
    expect(decoded.recoveryMode).toBe("strict");
  });
});
