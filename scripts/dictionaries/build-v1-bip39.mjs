import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { wordlists } from 'bip39';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const pkgRoot = resolve(__dirname, '..', '..');
  const outDir = resolve(pkgRoot, 'data');

  console.log('Project root detected as:', pkgRoot);

  await mkdir(outDir, { recursive: true });

  // Show exactly what path we're trying to load
  const libPath = resolve(pkgRoot, 'dist/index.js');
  console.log('Loading library from:', libPath);

  let lib;
  try {
    const libUrl = pathToFileURL(libPath).href;
    console.log('Import URL:', libUrl);
    lib = await import(libUrl);
    console.log('Library loaded successfully');
  } catch (err) {
    console.error('Failed to load library:');
    console.error(err.message);
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('\nMost likely causes:');
      console.error('1. You forgot to run "npm run build" (or tsc / rollup)');
      console.error('2. dist/index.js does not exist');
      console.error('3. Wrong path calculation');
    }
    process.exit(1);
  }

  if (typeof lib.buildDictionary !== 'function') {
    throw new Error('buildDictionary function not exported from dist/index.js');
  }

  const words = wordlists.english;

  if (!Array.isArray(words) || words.length !== 2048) {
    throw new Error(
      `BIP-39 English wordlist invalid (length = ${words?.length ?? 'missing'})`
    );
  }

  console.log(`Building dictionary with ${words.length} BIP-39 words...`);

  let dict;
  try {
    dict = await lib.buildDictionary(words, {
      version: 1,
      description: 'WordBin dictionary v1 – BIP-39 English (2048 words)',
    });
  } catch (err) {
    console.error('buildDictionary failed:');
    console.error(err);
    process.exit(1);
  }

  const outPath = resolve(outDir, 'wordbin-v1-bip39.json');

  try {
    const json = JSON.stringify(dict, null, 2);
    await writeFile(outPath, json, 'utf8');

    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
    console.log(`Success! Wrote dictionary (${sizeKB} kB) to:`);
    console.log('  ' + outPath);
  } catch (err) {
    console.error('Failed to write output file:');
    console.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error in main():');
  console.error(err);
  process.exit(1);
});