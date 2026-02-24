// File: scripts\dictionaries\build-v2-dwyl.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import https from "node:https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function fetchWordlist(url) {
  return new Promise((resolve, reject) => {
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

  // Load your built library
  const libPath = resolve(pkgRoot, "dist/index.js");
  console.log("Trying to load library from:", libPath);
  let lib;
  try {
    const libUrl = pathToFileURL(libPath).href;
    lib = await import(libUrl);
    console.log("Successfully imported library");
  } catch (err) {
    console.error(`Failed to load your library from ${libPath}`);
    console.error(err);
    process.exit(1);
  }

  if (typeof lib.buildDictionary !== "function") {
    throw new Error("Library does not export buildDictionary function");
  }

  // Fetch the large dwyl wordlist
  const wordlistUrl =
    "https://raw.githubusercontent.com/dwyl/english-words/master/words.txt";
  let words;
  try {
    console.log(`Fetching large English wordlist (~466k–479k words)...`);
    words = await fetchWordlist(wordlistUrl);
  } catch (err) {
    console.error("Failed to download wordlist:", err.message);
    process.exit(1);
  }

  // Optional: filter example (uncomment/adjust as needed)
  // words = words
  //   .filter(w => w.length >= 3 && /^[a-z]+$/i.test(w))  // only letters, min length 3
  //   .map(w => w.toLowerCase());                         // normalize case
  // console.log(`After filtering: ${words.length} words`);

  console.log(
    "Building dictionary (this may take a while with 466k+ words)...",
  );

  let dict;
  try {
    dict = await lib.buildDictionary(words, {
      version: 2,
      description: `WordBin dictionary v2 – dwyl/english-words (${words.length} words)`,
    });
  } catch (err) {
    console.error("buildDictionary failed:");
    console.error(err);
    process.exit(1);
  }

  const outPath = resolve(outDir, "wordbin-v2-dwyl-479k.json");
  try {
    const json = JSON.stringify(dict, null, 2);
    await writeFile(outPath, json, "utf8");

    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
    console.log(`Success! Wrote Version 2 dictionary (${sizeKB} kB) to:`);
    console.log(`  ${outPath}`);
    console.log(`Total words used: ${words.length}`);
  } catch (err) {
    console.error(`Failed to write ${outPath}:`, err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
