// test/test.spec.ts
import { WordBin } from "../src/core";
import { describe, it, expect, beforeAll } from "vitest";

// ─── Toggle which suites run ──────────────────────────────────────────────────
//
// Set a flag to true to enable that suite, false to skip it entirely.
//
// You can also target a single suite from the CLI without touching this file:
//   npx vitest -t "Encode only"
//   npx vitest -t "Decode only"
//   npx vitest -t "Encode then decode"
//   npx vitest -t "Non-WordBin decode"
//
const RUN = {
  ENCODE_ONLY: false, // encode text → inspect all payload formats
  DECODE_ONLY: true, // decode a ready-made payload → inspect result
  ENCODE_THEN_DECODE: false, // full round-trip across all formats
  NON_WORDBIN_DECODE: false, // decode payloads that are NOT WordBin-encoded
} as const;

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SAMPLE_TEXT =
  "stock ridge avoid school honey trap wait wheel worry face differ wedding";

// A pre-encoded hex payload produced by a previous encode run with the v1 dict.
// Update this value whenever you rebuild or change the dictionary.
const KNOWN_HEX_PAYLOAD =
  "0108c424409e363270f7d64deba55e2e11ba716eba59926de2f50282599fc5afd1a8";

// const KNOWN_BIN21_PAYLOAD = "Ä$@ÖMë¥^.◄ºqnºYmâõ☻Y";

// ─── Suite setup ──────────────────────────────────────────────────────────────

describe("WordBin", () => {
  let wb: WordBin;

  beforeAll(async () => {
    wb = await WordBin.create({ debug: false });
    console.log("\n[setup] dictionary version:", wb["primaryDictVersion"]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. ENCODE ONLY
  //    Encodes text and verifies every payload representation is well-formed.
  //    Does NOT attempt to decode.
  // ══════════════════════════════════════════════════════════════════════════
  describe("Encode only", () => {
    const suite = RUN.ENCODE_ONLY ? it : it.skip;

    suite("produces correct payload representations", async () => {
      console.group("\n=== Encode only ===");

      const encoded = await wb.encode(SAMPLE_TEXT);

      console.log("Original        :", SAMPLE_TEXT);
      console.log("Version byte    :", encoded.dictVersion);
      console.log("Hex payload     :", encoded.hexPayload);
      console.log("Base58 payload  :", encoded.base58Payload);
      console.log("Base64 payload  :", encoded.base64Payload);
      console.log("Bin21 payload  :", encoded.payload);
      console.log("Encoded bytes   :", encoded.encodedBytes);
      console.log("Original bytes  :", encoded.originalBytes);
      console.log("Bytes saved     :", encoded.bytesSaved);
      console.log("Ratio           :", encoded.ratioPercent + "%");
      console.log("First 6 bytes   :", [...encoded.encoded.slice(0, 6)]);
      console.groupEnd();

      // Version header byte must match what the encoder recorded
      expect(encoded.encoded[0], "first byte = version").toBe(
        encoded.dictVersion,
      );

      // Hex: lowercase hex chars only, even length, opens with version byte
      expect(encoded.hexPayload, "hex: valid chars").toMatch(/^[0-9a-f]+$/);
      expect(encoded.hexPayload.length % 2, "hex: even length").toBe(0);
      expect(
        encoded.hexPayload.slice(0, 2),
        "hex: starts with version byte",
      ).toBe(encoded.dictVersion.toString(16).padStart(2, "0"));

      // Base64: standard alphabet + optional = padding
      expect(encoded.base64Payload, "base64: valid chars").toMatch(
        /^[A-Za-z0-9+/]+=*$/,
      );

      // Base58: only Base58 alphabet (no 0, O, I, l)
      expect(encoded.base58Payload, "base58: valid chars").toMatch(
        /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
      );

      // Compression: encoded must be smaller than original
      expect(encoded.encodedBytes, "compressed < original").toBeLessThan(
        encoded.originalBytes,
      );
      expect(encoded.bytesSaved, "bytes saved > 0").toBeGreaterThan(0);
      expect(encoded.ratioPercent, "ratio < 100%").toBeLessThan(100);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. DECODE ONLY
  //    Decodes known, pre-built payloads without encoding first.
  //    Useful for verifying the decoder independently of the encoder.
  // ══════════════════════════════════════════════════════════════════════════
  describe("Decode only", () => {
    const suite = RUN.DECODE_ONLY ? it : it.skip;

    suite("decodes a known WordBin bin21 payload", async () => {
      const { bin21Payload } = await wb.encode(SAMPLE_TEXT);

      console.group("\n=== Decode only — WordBin bin21 ===");
      const result = await wb.decode(bin21Payload);
      console.log("Input payload   :", bin21Payload);
      console.log("Decoded text    :", result.text);
      console.log("Detected format :", result.detectedFormat);
      console.log("Is WordBin      :", result.isWordBin);
      console.groupEnd();

      expect(result.text, "text = original").toBe(SAMPLE_TEXT);
      expect(result.isWordBin, "isWordBin = true").toBe(true);
      expect(result.detectedFormat, "format = bin21").toBe("bin21");
    });

    suite("decodes a known WordBin hex payload", async () => {
      console.group("\n=== Decode only — WordBin hex ===");

      const result = await wb.decode(KNOWN_HEX_PAYLOAD);

      console.log("Input payload   :", KNOWN_HEX_PAYLOAD);
      console.log("Decoded text    :", result.text);
      console.log("Detected format :", result.detectedFormat);
      console.log("Is WordBin      :", result.isWordBin);
      if (result.notice) console.warn("Notice          :", result.notice);
      console.groupEnd();

      expect(result.text, "text = original").toBe(SAMPLE_TEXT);
      expect(result.isWordBin, "isWordBin = true").toBe(true);
      expect(result.detectedFormat, "format = hex").toBe("hex");
      expect(result.notice, "no notice").toBeUndefined();
    });

    suite("decodes a known WordBin base64 payload", async () => {
      const { base64Payload } = await wb.encode(SAMPLE_TEXT);

      console.group("\n=== Decode only — WordBin base64 ===");
      const result = await wb.decode(base64Payload);
      console.log("Input payload   :", base64Payload);
      console.log("Decoded text    :", result.text);
      console.log("Detected format :", result.detectedFormat);
      console.log("Is WordBin      :", result.isWordBin);
      console.groupEnd();

      expect(result.text, "text = original").toBe(SAMPLE_TEXT);
      expect(result.isWordBin, "isWordBin = true").toBe(true);
      expect(result.detectedFormat, "format = base64").toBe("base64");
    });

    suite("decodes a non-WordBin payload with best-effort scan", async () => {
      // Plain "Hello World" as hex — not a WordBin payload
      const foreignHex = Buffer.from("Hello World", "utf-8").toString("hex");

      console.group("\n=== Decode only — non-WordBin hex ===");
      const result = await wb.decode(foreignHex);
      console.log("Input payload   :", foreignHex);
      console.log("Decoded text    :", result.text);
      console.log("Detected format :", result.detectedFormat);
      console.log("Is WordBin      :", result.isWordBin);
      console.log("Raw segments    :", result.rawSegments?.length ?? 0);
      if (result.notice) console.warn("Notice          :", result.notice);
      console.groupEnd();

      expect(typeof result.text, "text is string").toBe("string");
      expect(result.isWordBin, "isWordBin = false").toBe(false);
      expect(result.notice, "notice is set").toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. ENCODE THEN DECODE  (full round-trip)
  //    Encodes text, then decodes every format back and checks for equality.
  // ══════════════════════════════════════════════════════════════════════════
  describe("Encode then decode", () => {
    const suite = RUN.ENCODE_THEN_DECODE ? it : it.skip;

    suite(
      "round-trips all payload formats back to the original text",
      async () => {
        const encoded = await wb.encode(SAMPLE_TEXT);

        const formats: Array<[string, string | Uint8Array]> = [
          ["hex", encoded.hexPayload],
          ["base58", encoded.base58Payload],
          ["base64", encoded.base64Payload],
          ["bin21", encoded.payload], // Latin-1 bin21Payload string
          ["Uint8Array", encoded.encoded], // raw bytes
        ];

        console.group("\n=== Encode then decode — round-trips ===");
        for (const [label, payload] of formats) {
          const result = await wb.decode(payload);

          console.log(`\n[${label}]`);
          console.log("  text      :", result.text);
          console.log("  format    :", result.detectedFormat);
          console.log("  isWordBin :", result.isWordBin);
          if (result.notice) console.warn("  notice    :", result.notice);

          expect(result.text, `${label} → text`).toBe(SAMPLE_TEXT);
          expect(result.isWordBin, `${label} → isWordBin`).toBe(true);
          expect(result.notice, `${label} → no notice`).toBeUndefined();
        }
        console.groupEnd();
      },
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. NON-WORDBIN DECODE
  //    Ensures the decoder handles arbitrary / foreign payloads gracefully.
  //    isWordBin must be false, a notice must be present, text must be a string.
  // ══════════════════════════════════════════════════════════════════════════
  describe("Non-WordBin decode", () => {
    const suite = RUN.NON_WORDBIN_DECODE ? it : it.skip;

    const cases: Array<{ label: string; payload: string | Uint8Array }> = [
      {
        label: "plain UTF-8 as hex",
        payload: Buffer.from("Hello World", "utf-8").toString("hex"),
      },
      {
        label: "random binary Uint8Array",
        payload: new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02]),
      },
      {
        label: "plain text as base64",
        payload: Buffer.from("This is not WordBin").toString("base64"),
      },
      {
        label: "old broken-encoder hex output",
        payload:
          "39e91c486e14ace89769362cee7e39446e8efb344348a1031d747317616f70e3",
      },
    ];

    for (const { label, payload } of cases) {
      suite(`gracefully handles: ${label}`, async () => {
        console.group(`\n=== Non-WordBin decode — ${label} ===`);

        const result = await wb.decode(payload);

        console.log("Decoded text    :", result.text);
        console.log("Detected format :", result.detectedFormat);
        console.log("Is WordBin      :", result.isWordBin);
        console.log(
          "Raw segments    :",
          result.rawSegments?.length ?? 0,
          "unmatched",
        );
        if (result.notice) console.warn("Notice          :", result.notice);
        console.groupEnd();

        expect(typeof result.text, "text is always a string").toBe("string");
        expect(result.text.length, "text is non-empty").toBeGreaterThan(0);
        expect(result.isWordBin, "not a WordBin payload").toBe(false);
        expect(result.notice, "notice explains fallback").toBeDefined();
      });
    }
  });
});
