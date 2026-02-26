import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { WordBinDictionary } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1️⃣ Bundled dictionaries inside the package (dist/data)
const PACKAGE_DATA_DIR = path.join(__dirname, "data");

// 2️⃣ User project dictionaries (built via CLI)
const LOCAL_DATA_DIR = path.join(process.cwd(), "data");

/**
 * Get all dictionary directories that exist
 * Priority: LOCAL first, then PACKAGE fallback
 */
async function getExistingDataDirs(): Promise<string[]> {
  const dirs: string[] = [];

  try {
    await fs.access(LOCAL_DATA_DIR);
    dirs.push(LOCAL_DATA_DIR);
  } catch {}

  try {
    await fs.access(PACKAGE_DATA_DIR);
    dirs.push(PACKAGE_DATA_DIR);
  } catch {}

  return dirs;
}

/**
 * Scan all available dictionary versions from all data dirs
 */
export async function getAllAvailableDictionaryVersions(): Promise<number[]> {
  const dirs = await getExistingDataDirs();
  const versions = new Set<number>();

  for (const dir of dirs) {
    try {
      const files = await fs.readdir(dir);

      for (const file of files) {
        const match = file.match(/wordbin-v(\d+)/i);
        if (match) {
          versions.add(parseInt(match[1], 10));
        }
      }
    } catch {
      // Ignore invalid dirs silently
    }
  }

  return Array.from(versions).sort((a, b) => a - b);
}

/**
 * Load a specific dictionary version
 * LOCAL dictionaries override PACKAGE ones
 */
export async function loadDictionaryByVersion(
  version: number,
): Promise<WordBinDictionary> {
  const dirs = await getExistingDataDirs();

  if (dirs.length === 0) {
    throw new Error(
      `No dictionary directories found. Expected ./data or bundled package data.`,
    );
  }

  for (const dir of dirs) {
    const files = await fs.readdir(dir);

    const versionFile = files.find((f) =>
      f.match(new RegExp(`wordbin-v${version}(?:\\.|-)`, "i")),
    );

    if (versionFile) {
      const filePath = path.join(dir, versionFile);
      const data = await fs.readFile(filePath, "utf-8");
      const dict = JSON.parse(data) as WordBinDictionary;

      if (dict.version !== version) {
        throw new Error(
          `Version mismatch: file ${versionFile} claims v${dict.version} but expected v${version}`,
        );
      }

      return dict;
    }
  }

  const available = await getAllAvailableDictionaryVersions();

  throw new Error(
    `Dictionary version ${version} not found. Available versions: ${available.join(", ")}`,
  );
}

/**
 * Load the latest available dictionary version
 */
export async function loadLatestDictionary(): Promise<WordBinDictionary> {
  const versions = await getAllAvailableDictionaryVersions();

  if (versions.length === 0) {
    throw new Error(
      `No dictionary files found. Run "npx wordbin build" or use bundled v1.`,
    );
  }

  const latestVersion = Math.max(...versions);

  console.log(
    `Loading latest dictionary: v${latestVersion} (available: ${versions.join(", ")})`,
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
