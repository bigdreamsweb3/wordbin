import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { WordBinDictionary } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DICT_DIR = path.join(__dirname, "../data");

/**
 * Get all available dictionary versions by scanning the data directory
 * Looks for files matching pattern: wordbin-v*.json or wordbin-v*-*.json
 */
export async function getAllAvailableDictionaryVersions(): Promise<number[]> {
  try {
    const files = await fs.readdir(DICT_DIR);

    const versions = new Set<number>();

    for (const file of files) {
      // Match patterns like: wordbin-v1.json, wordbin-v1-bip39.json, etc.
      const match = file.match(/wordbin-v(\d+)/i);
      if (match) {
        versions.add(parseInt(match[1], 10));
      }
    }

    return Array.from(versions).sort((a, b) => a - b);
  } catch (error) {
    console.error(`Failed to scan dictionary directory: ${DICT_DIR}`, error);
    return [];
  }
}

/**
 * Load a specific dictionary version
 * Throws error if version not found
 */
export async function loadDictionaryByVersion(
  version: number,
): Promise<WordBinDictionary> {
  const availableVersions = await getAllAvailableDictionaryVersions();

  if (!availableVersions.includes(version)) {
    throw new Error(
      `Dictionary version ${version} not found. Available versions: ${availableVersions.join(", ")}`,
    );
  }

  // Look for exact file match first
  const files = await fs.readdir(DICT_DIR);
  const versionFile = files.find((f) =>
    f.match(new RegExp(`wordbin-v${version}(?:\\.|-)`, "i")),
  );

  if (!versionFile) {
    throw new Error(
      `Dictionary file for version ${version} not found in ${DICT_DIR}`,
    );
  }

  const filePath = path.join(DICT_DIR, versionFile);
  const data = await fs.readFile(filePath, "utf-8");
  const dict = JSON.parse(data) as WordBinDictionary;

  // Validate version matches
  if (dict.version !== version) {
    throw new Error(
      `Version mismatch: file ${versionFile} claims to be v${dict.version}, but loaded as v${version}`,
    );
  }

  return dict;
}

/**
 * Load the latest available dictionary version
 */
export async function loadLatestDictionary(): Promise<WordBinDictionary> {
  const versions = await getAllAvailableDictionaryVersions();

  if (versions.length === 0) {
    throw new Error(
      `No dictionary files found in ${DICT_DIR}. Expected files like wordbin-v1.json`,
    );
  }

  const latestVersion = Math.max(...versions);
  console.log(
    `Loading latest dictionary: version ${latestVersion} (available: ${versions.join(", ")})`,
  );

  return loadDictionaryByVersion(latestVersion);
}

/**
 * Check if a specific version exists
 */
export async function hasDictionaryVersion(version: number): Promise<boolean> {
  const versions = await getAllAvailableDictionaryVersions();
  return versions.includes(version);
}