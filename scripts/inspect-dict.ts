import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { generateWordId } from "../src/core/id.js";
import { toHex } from "../src/utils/buffer.js";
import type { WordBinDictionary } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function inspectDictionary() {
  console.log("=== Dictionary Inspector ===\n");

  const dictPath = path.join(__dirname, "../data/dict-v1-bip39.json");

  try {
    const data = await fs.readFile(dictPath, "utf8");
    const dict: WordBinDictionary = JSON.parse(data);

    console.log(`Dictionary version: ${dict.version}`);
    console.log(`Total entries: ${Object.keys(dict.words).length}`);
    console.log(`\nFirst 10 dictionary keys (hex):`);

    const keys = Object.keys(dict.words).slice(0, 10);
    for (const key of keys) {
      const words = dict.words[key];
      console.log(`  ${key} => ${words.join(", ")}`);
    }

    // Now test if our word IDs match
    console.log("\n\n=== Testing Word ID Generation ===\n");

    const testWords = ["abandon", "ability", "able", "about", "above"];

    for (const word of testWords) {
      const id = await generateWordId(word);
      const hexId = toHex(id);
      const exists = hexId in dict.words;

      console.log(`Word: "${word}"`);
      console.log(`  Generated ID: ${hexId}`);
      console.log(`  Exists in dict: ${exists}`);

      if (exists) {
        console.log(
          `  ✓ Maps to: ${dict.words[hexId as keyof typeof dict.words].join(", ")}`,
        );
      } else {
        // Try to find similar keys
        const dictKeys = Object.keys(dict.words);
        const similar = dictKeys.filter((k) =>
          k.toLowerCase().includes(hexId.toLowerCase().substring(0, 4)),
        );
        if (similar.length > 0) {
          console.log(`  Similar keys: ${similar.slice(0, 3).join(", ")}`);
        }
      }
      console.log();
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

inspectDictionary();
