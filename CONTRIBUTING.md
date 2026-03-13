# Contributing to WordBin

Thank you for your interest in contributing to WordBin!  
We welcome all kinds of help — bug reports, documentation improvements, new features, dictionary variants, tests, or small fixes.

This guide explains how to contribute effectively and what would be most valuable to the project right now.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features or Improvements](#suggesting-features-or-improvements)
  - [Submitting Pull Requests](#submitting-pull-requests)
  - [Good First Issues](#good-first-issues)
- [Development Setup](#development-setup)
- [Project Layout](#project-layout)
- [Running Tests](#running-tests)
- [Where Things Live](#where-things-live)
- [Current Priorities (2026)](#current-priorities-2026)
- [Code Style & Conventions](#code-style--conventions)
- [License](#license)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).  
Be respectful, inclusive, and constructive in all interactions.

---

## How to Contribute

### Reporting Bugs

If you find a bug:

1. Check if it's already reported in [existing issues](https://github.com/bigdreamsweb3/wordbin/issues).
2. If not, open a new issue and include:
   - A clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behaviour
   - Node.js version (`node -v`)
   - Dictionary version used (v1 / v2 / custom)
   - The payload format involved (hex / base58 / base64 / bytes)
   - A minimal code snippet or failing test case

### Suggesting Features or Improvements

Open an issue with:

- The problem or opportunity you're addressing
- Your proposed solution (as detailed as you like)
- Any alternatives you considered
- Rough estimate of impact

For larger architectural changes — new payload formats, new dictionary structures, changes to the encode/decode pipeline — please open an issue to discuss before writing code.

### Submitting Pull Requests

1. **Fork** the repository and **clone** your fork
2. Create a focused branch:
   ```bash
   git checkout -b fix/decode-format-detection
   # or
   git checkout -b feat/add-top-20k-dictionary
   ```
3. Make your changes
4. Add or update tests in `test/test.spec.ts` for any new behaviour
5. Run the full test suite and confirm everything passes:
   ```bash
   npm test
   ```
6. Commit with clear, semantic messages:
   ```
   fix: correct format detection in detectAndConvert
   feat: add partialScan fallback for non-WordBin payloads
   docs: update decode API in README
   test: add round-trip cases for base58 and base64 formats
   ```
7. Push your branch and open a pull request against `main`

Small, focused PRs are merged quickly. For larger changes, open a draft PR early — it's easier to align on approach before a lot of code is written.

### Good First Issues

Looking for an easy entry point? These are beginner-friendly:

- Fix documentation or README examples
- Add case normalisation (lowercase) to dictionary building
- Create a smaller curated dictionary (e.g. top 10k–50k English words)
- Add more helpful messages or progress indicators to the CLI
- Write tests for edge cases (empty strings, very long phrases, single-word inputs)
- Build a simple browser demo (CodeSandbox, StackBlitz, or a static HTML page)

Look for issues labelled **[good first issue]** on GitHub.

---

## Development Setup

**Prerequisites:** Node.js ≥ 18, npm ≥ 9

```bash
# 1. Fork and clone
git clone https://github.com/bigdreamsweb3/wordbin.git
cd wordbin

# 2. Install dependencies
npm install

# 3. Build the library
npm run build

# 4. Run the tests
npm test
```

---

## Project Layout

```
wordbin/
├── src/
│   ├── core/
│   │   └── wordbin.ts          # WordBin class — encode(), decode(), format detection
│   ├── dict/
│   │   ├── dictionary-loader.ts # loadLatestDictionary, loadDictionaryByVersion
│   │   ├── builder.ts           # buildDictionary() — constructs dict from a wordlist
│   │   └── data/                # Bundled v1 (BIP-39) dictionary JSON
│   ├── utils/
│   │   └── buffer.ts            # toHex, toBase64, encodeVarint, decodeVarint, utf8*
│   └── constants.ts             # LITERAL token value and other shared constants
├── test/
│   └── test.spec.ts             # Vitest suites — encode, decode, round-trip, non-WordBin
├── data/                        # Built dictionary files — generated, gitignored
└── dist/                        # Compiled output — generated on build, not committed
```

---

## Running Tests

The test suite is organised into four independently-controllable suites.

```bash
npm test                          # run everything once
npm run test:watch                # watch mode — re-runs on save
```

### Run a single suite via CLI

```bash
npx vitest -t "Encode only"
npx vitest -t "Decode only"
npx vitest -t "Encode then decode"
npx vitest -t "Non-WordBin decode"
```

### Toggle suites without touching the CLI

At the top of `test/test.spec.ts`:

```ts
const RUN = {
  ENCODE_ONLY: true, // encode text → verify all payload representations
  DECODE_ONLY: true, // decode a pre-built payload → verify result
  ENCODE_THEN_DECODE: true, // full round-trip across all 5 formats
  NON_WORDBIN_DECODE: true, // arbitrary payloads → graceful fallback behaviour
};
```

Set any flag to `false` to skip that suite entirely. Skipped suites are reported as skipped — they are never silently removed.

### What each suite covers

| Suite                  | What it tests                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Encode only**        | All payload formats (hex, base58, base64), compression ratio, format validity                |
| **Decode only**        | Known hex payload, known base64 payload, non-WordBin fallback                                |
| **Encode then decode** | Full round-trip for hex, base58, base64, and raw `Uint8Array`                                |
| **Non-WordBin decode** | 4 foreign payloads — verifies `isWordBin: false`, `notice` is set, `text` is always a string |

---

## Where Things Live

| What you want to change                          | File                                 |
| ------------------------------------------------ | ------------------------------------ |
| Encode / decode logic                            | `src/core/wordbin.ts`                |
| Payload format detection (hex / base58 / base64) | `detectAndConvert()` in `wordbin.ts` |
| `DecodeResult` type or `PayloadFormat` union     | top of `wordbin.ts`                  |
| Partial scan / best-effort fallback              | `partialScan()` in `wordbin.ts`      |
| Dictionary loading and versioning                | `src/dict/dictionary-loader.ts`      |
| Building a dictionary from a wordlist            | `src/dict/builder.ts`                |
| Buffer utilities (varint, hex, utf8)             | `src/utils/buffer.ts`                |
| Shared constants (LITERAL byte value)            | `src/constants.ts`                   |
| Tests                                            | `test/test.spec.ts`                  |

---

## Current Priorities (2026)

These improvements would have the biggest impact right now:

- **Case-insensitive dictionaries** — normalise to lowercase during dictionary building so `"Hello"` and `"hello"` encode identically
- **Smaller curated dictionaries** — top 10k–50k common English words, programming keywords, domain-specific lists (DeFi, medical, etc.)
- Note: Bin21 removed — hex is primary payload. Remove any Bin21-specific tests or docs.
- **Performance benchmarks** — encode/decode throughput across dictionary sizes and phrase lengths
- **Browser demo** — a minimal CodeSandbox or static HTML page showing encode/decode live
- **CLI enhancements** — progress bars, `--lowercase` flag, `--output-dir`, improved help text
- **Error messages** — clearer messages when a dictionary is missing, input is invalid, or a version mismatch is detected

If you're unsure where to begin, open an issue or a draft PR — we're happy to help you find a good starting point.

---

## Code Style & Conventions

- **ESM** — `import` / `export` throughout, no CommonJS
- **TypeScript** — all source files, strict mode preferred
- **Vitest** — for all tests; no Jest
- **async/await** — preferred over `.then()` chains
- **Small, focused functions** — each function does one thing
- **JSDoc** on all public methods and exported types

Run these before committing:

```bash
npm run lint
npm run format
```

---

## License

By contributing code to this project, you agree that your contribution will be licensed under the same [MIT License](./LICENSE) as the rest of the project.

Thank you for helping make WordBin better — we up 🚀
