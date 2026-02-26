// test/test.spec.ts
import { WordBin } from "../src/core.js";
import { describe, it, expect, beforeAll } from "vitest";

describe("WordBin – Core Functionality", () => {
  let wb: WordBin;

  beforeAll(async () => {
    wb = await WordBin.create({ debug: false });
    console.log(
      "\n=== Using WordBin with dictionary version:",
      wb["primaryDictVersion"],
    );
  });

  describe("Encoding & Decoding", () => {
    it.only("supports deep decoding – repeated common words", async () => {
      const original =
        "poul either learn purse candy leader craft undo spoil forum slot spirit";

      console.group("\n=== Encoding process ===");
      console.log("Original text:", original);
      console.log("Word count:", original.split(/\s+/).length);

      const encoded = await wb.encode(original);

      console.log("\nEncoding result summary:");
      console.log("  Version used (header byte):", encoded.dictVersion);
      console.log("  Payload:", encoded.payload);
      console.log("  Encoded length:", encoded.encodedBytes, "bytes");
      console.log("  Original length:", encoded.originalBytes, "bytes");
      console.log("  Bytes saved:", encoded.bytesSaved);
      console.log(
        "  Compression ratio:",
        encoded.ratioPercent + "%",
        `(${Math.round((encoded.bytesSaved / encoded.originalBytes) * 100)}% reduction)`,
      );

      // Visual progress bar for compression
      const barLength = 30;
      const filled = Math.round((encoded.ratioPercent / 100) * barLength);
      console.log(
        "  [" +
          "█".repeat(filled) +
          " ".repeat(barLength - filled) +
          "] " +
          encoded.ratioPercent +
          "%",
      );

      console.log("\nFirst 20 bytes of encoded result:", [
        ...encoded.encoded.slice(0, 20),
      ]);
      console.log(
        "Base64 starts with:",
        encoded.encodedBase64.slice(0, 24) + "...",
      );

      console.groupEnd();

      console.group("\n=== Decoding process ===");
      const decoded = await wb.decode(encoded.payload);

      console.log("Decoded result:", decoded);
      console.log("Decoded length (chars):", decoded.length);
      console.log("Matches original?", decoded === original);
      console.groupEnd();

      expect(decoded).toBe(original);

      // Updated assertions – no magic bytes
      expect(encoded.encoded[0]).toBeGreaterThanOrEqual(1); // version
      expect(encoded.encodedBytes).toBeLessThan(encoded.originalBytes);
    });
    it("handles mixed dictionary words + unknown literals", async () => {
      const mixedText = "abandon taxi quantum zzzxyz hello-world 123";

      console.group("\n=== Mixed content test ===");
      console.log("Input:", mixedText);

      const encodedMixed = await wb.encode(mixedText);

      console.log("\nMixed encoding result:");
      console.log("  Version:", encodedMixed.encoded[2]);
      console.log("  Length:", encodedMixed.encodedBytes, "bytes");
      console.log("  First bytes:", [...encodedMixed.encoded.slice(0, 16)]);
      console.log("  Base64:", encodedMixed.encodedBase64.slice(0, 32) + "...");

      const decodedMixed = await wb.decode(encodedMixed.encoded);

      console.log("Decoded:", decodedMixed);
      console.log("Round-trip success?", decodedMixed === mixedText);

      expect(decodedMixed).toBe(mixedText);
      console.groupEnd();
    });
  });
});
