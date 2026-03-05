#!/usr/bin/env node

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { wordlists } from "bip39";
import { buildDictionary } from "./index";

const rl = createInterface({ input, output });

const help = `
WordBin CLI – Dictionary Builder

Usage:
  npx wordbin build [options]

Options:
  --version <num>    Build specific version (1 or 2)
  --all              Build all versions
  --custom <source>  Build from custom URL or local file path
  --help             Show this help

If no options provided, enters interactive mode.
`;

const args = process.argv.slice(2);
const cmd = args[0];

async function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function saveDict(
  version: number,
  desc: string,
  words: string[],
  filename: string,
) {
  const dict = await buildDictionary(words, {
    version,
    description: desc,
  });

  const outDir = resolve(process.cwd(), "data");
  await mkdir(outDir, { recursive: true });

  const outPath = resolve(outDir, filename);
  await writeFile(outPath, JSON.stringify(dict, null, 2), "utf8");

  console.log(`Saved ${filename} (${words.length} words) to ${outPath}`);
}

async function fetchWordsFromUrl(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);

  const text = await res.text();
  return text
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean);
}

async function readWordsFromFile(path: string) {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean);
}

async function buildV1() {
  const words = wordlists.english;

  if (!Array.isArray(words) || words.length !== 2048) {
    throw new Error("Invalid BIP-39 wordlist");
  }

  await saveDict(
    1,
    "WordBin dictionary v1 – BIP-39 English (2048 words)",
    words,
    "wordbin-v1-bip39.json",
  );
}

async function buildV2() {
  console.log("Downloading dwyl/english-words...");

  const url =
    "https://raw.githubusercontent.com/dwyl/english-words/master/words.txt";

  const words = await fetchWordsFromUrl(url);

  await saveDict(
    2,
    `WordBin dictionary v2 – dwyl/english-words (${words.length} words)`,
    words,
    "wordbin-v2-dwyl.json",
  );
}

async function buildCustom(source: string) {
  let words: string[];

  if (source.startsWith("http://") || source.startsWith("https://")) {
    console.log(`Fetching from URL: ${source}`);
    words = await fetchWordsFromUrl(source);
  } else {
    console.log(`Reading from local file: ${source}`);
    words = await readWordsFromFile(source);
  }

  const version = 3;
  const desc = `WordBin custom dictionary v${version} – from ${source} (${words.length} words)`;

  await saveDict(version, desc, words, `wordbin-v${version}-custom.json`);
}

async function interactiveMode() {
  console.log("Interactive Dictionary Builder");
  console.log("Options: 1 (BIP-39), 2 (dwyl large), all, custom, or q to quit");

  const choice =
    (await prompt("Choose dictionary to build (default: 2): ")) || "2";

  if (choice === "q") {
    rl.close();
    return;
  }

  if (choice === "1") await buildV1();
  else if (choice === "2") await buildV2();
  else if (choice === "all") {
    await buildV1();
    await buildV2();
  } else if (choice === "custom") {
    const source = await prompt("Enter URL or local file path: ");
    if (source) await buildCustom(source);
  } else {
    console.error("Invalid choice");
  }

  rl.close();
}

async function main() {
  if (cmd === "--help" || cmd === "-h") {
    console.log(help);
    process.exit(0);
  }

  if (cmd === "build") {
    if (args.length === 1) {
      await interactiveMode();
      return;
    }

    const option = args[1];

    if (option === "--version") {
      const ver = parseInt(args[2]);
      if (ver === 1) await buildV1();
      else if (ver === 2) await buildV2();
      else console.error("Invalid version");
    } else if (option === "--all") {
      await buildV1();
      await buildV2();
    } else if (option === "--custom") {
      const source = args[2];
      if (!source) {
        console.error("Provide URL or file path");
        process.exit(1);
      }
      await buildCustom(source);
    } else {
      console.log(help);
    }

    return;
  }

  console.log(help);
  process.exit(1);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
