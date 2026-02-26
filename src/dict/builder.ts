// File: src\dict\builder.ts

import type { WordBinDictionary } from "../types";
import { generateWordId } from "../core/id.js";
import { toHex } from "../utils/buffer.js";

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
      let attempt = 0;
      let key: string;

      while (true) {
        const id = await generateWordId(
          attempt === 0 ? word : `${word}:${attempt}`,
        );

        key = toHex(id);

        // If no collision, break
        if (!map[key]) {
          map[key] = [word];
          break;
        }

        // Collision detected → try again
        attempt++;
      }
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
