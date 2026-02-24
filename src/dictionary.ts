// File: src\dictionary.ts

import type { WordBinDictionary } from "./types";
import { generateWordId } from "./core/id.js";
import { toHex } from "./utils/buffer.js";

export interface BuildDictionaryOptions {
  /**
   * Dictionary version number (used in header and for format compatibility)
   * @default 1
   */
  version?: number;

  /**
   * Human-readable description of this dictionary
   * @default "WordBin dictionary v${version}"
   */
  description?: string;

  /**
   * Optional: custom prefix or identifier for this dictionary build
   * (can be used in logs, filenames, etc.)
   */
  name?: string;
}

export async function buildDictionary(
  words: string[],
  options: BuildDictionaryOptions = {},
): Promise<WordBinDictionary> {
  const { version = 1, description = `WordBin dictionary v${version}` } =
    options;

  const map: Record<string, string[]> = {};

  const normalizedWords = words
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w);

  await Promise.all(
    normalizedWords.map(async (word) => {
      const id = await generateWordId(word);
      const key = toHex(id);
      if (!map[key]) map[key] = [];
      map[key].push(word);
    }),
  );

  Object.values(map).forEach((collisions) => {
    collisions.sort((a, b) => a.localeCompare(b));
  });

  return {
    version,
    description,
    words: map,
  };
}
