// scripts/dictionaries/build-v2-dwyl.ts

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import { buildDictionary } from "../../src/dict/builder";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function fetchWordlist(url: string) {
  return new Promise<string[]>((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} fetching wordlist`));
        }
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const words = data
            .trim()
            .split("\n")
            .map((w) => w.trim())
            .filter((w) => w.length > 0); // remove any empty lines

          console.log(`Downloaded ${words.length} words from ${url}`);

          // Optional quick quality checks
          if (words.length < 400_000) {
            console.warn("Warning: Fewer words than expected (~466k–479k)");
          }
          // Example: show first & last few
          console.log("First 5:", words.slice(0, 5));
          console.log("Last 5:", words.slice(-5));

          resolve(words);
        });
      })
      .on("error", reject);
  });
}

async function main() {
  const pkgRoot = resolve(__dirname, "..", "..");
  const outDir = resolve(pkgRoot, "data");
  await mkdir(outDir, { recursive: true });

  // No dist loading anymore – we already imported buildDictionary directly

  const wordlistUrl =
    "https://raw.githubusercontent.com/dwyl/english-words/master/words.txt";
  let words: string[] = [];
  try {
    console.log(`Fetching large English wordlist …`);
    words = await fetchWordlist(wordlistUrl);
  } catch (err: any) {
    console.error("Failed to download wordlist:", err.message);
    process.exit(1);
  }

  console.log("Building dictionary (this may take a while) …");

  let dict;
  try {
    dict = await buildDictionary(words, {
      version: 2,
      description: `WordBin dictionary v2 – dwyl/english-words (${words.length} words)`,
    });
  } catch (err: any) {
    console.error("buildDictionary failed:", err);
    process.exit(1);
  }

  const outPath = resolve(outDir, "dict-v2-dwyl-479k.json");
  try {
    const json = JSON.stringify(dict, null, 2);
    await writeFile(outPath, json, "utf8");
    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
    console.log(`Success! Wrote dictionary (${sizeKB} kB) to ${outPath}`);
    console.log(`Total words: ${words.length}`);
  } catch (err: any) {
    console.error(`Failed to write file:`, err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
