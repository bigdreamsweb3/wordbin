import { WordBin } from "./dist/core.js";
import { generateWordId } from "./dist/core/id.js";
import { toHex, toBase64, fromBase64 } from "./dist/utils/buffer.js";

async function debugTest() {
  console.log("=== WordBin Debug Test ===\n");

  // Create instance
  const wb = await WordBin.create();
  console.log(
    `Primary dictionary version: ${wb.getPrimaryDictionaryVersion()}`,
  );
  console.log(
    `Available versions: ${wb.getAvailableDictionaryVersions().join(", ")}\n`,
  );

  // Test with a simple word
  const testWords = ["abandon", "ability", "able"];

  for (const word of testWords) {
    console.log(`\nTesting word: "${word}"`);

    // Generate ID
    const id = await generateWordId(word);
    const hex = toHex(id);
    console.log(`  Generated ID (hex): ${hex}`);
    console.log(
      `  Generated ID (bytes): ${Array.from(id)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")}`,
    );

    // Try to encode
    try {
      const encoded = await wb.encode(word);
      console.log(`  Encode successful:`);
      console.log(`    Original bytes: ${encoded.originalBytes}`);
      console.log(`    Encoded bytes: ${encoded.encodedBytes}`);
      console.log(`    Encoded base64: ${encoded.encodedBase64}`);

      // Try to decode
      try {
        const decoded = await wb.decode(encoded.encodedBase64);
        console.log(`    Decoded: "${decoded}"`);
        console.log(`    ✓ Match: ${decoded === word}`);
      } catch (decodeErr) {
        console.log(`    ✗ Decode error: ${decodeErr.message}`);
      }
    } catch (encodeErr) {
      console.log(`  ✗ Encode error: ${encodeErr.message}`);
    }
  }

  // Test full sentence
  console.log("\n\n=== Full Sentence Test ===");
  const text = "abandon ability able about above to see God";
  console.log(`Original: ${text}`);

  try {
    const encoded = await wb.encode(text);
    console.log(`Encoded base64: ${encoded.encodedBase64}`);
    console.log(`Original bytes: ${encoded.originalBytes}`);
    console.log(`Encoded bytes: ${encoded.encodedBytes}`);
    console.log(
      `Saved: ${encoded.bytesSaved} bytes (${encoded.ratioPercent}%)`,
    );

    const decoded = await wb.decode(encoded.encodedBase64);
    console.log(`\nDecoded: ${decoded}`);
    console.log(`✓ Match: ${decoded === text}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

debugTest().catch(console.error);
