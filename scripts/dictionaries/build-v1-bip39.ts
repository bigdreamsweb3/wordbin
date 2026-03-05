import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wordlists } from "bip39";
import { buildDictionary } from "../../src/dict/builder";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const pkgRoot = resolve(__dirname, "..", "..");
  const outDir = resolve(pkgRoot, "data");

  console.log("Project root detected as:", pkgRoot);

  await mkdir(outDir, { recursive: true });

  const words = wordlists.english as string[];

  if (!Array.isArray(words) || words.length !== 2048) {
    throw new Error(
      `BIP-39 English wordlist invalid (length = ${words?.length ?? "missing"})`,
    );
  }

  console.log(`Building dictionary with ${words.length} BIP-39 words...`);

  let dict: unknown;

  try {
    dict = await buildDictionary(words, {
      version: 1,
      description: "WordBin dictionary v1 – BIP-39 English (2048 words)",
    });
  } catch (error) {
    console.error("buildDictionary failed:");
    console.error(error);
    process.exit(1);
  }

  const outPath = resolve(outDir, "wordbin-v1-bip39.json");

  try {
    const json = JSON.stringify(dict, null, 2);
    await writeFile(outPath, json, "utf8");

    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);

    console.log(`Success! Wrote dictionary (${sizeKB} kB) to:`);
    console.log("  " + outPath);
  } catch (error) {
    console.error("Failed to write output file:");
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error in main():");
  console.error(error);
  process.exit(1);
});
