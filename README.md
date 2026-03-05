# WordBin — Compact, Reversible Word-Phrase Encoder

[![npm version](https://img.shields.io/npm/v/@bigdreamsweb3/wordbin?style=flat-square)](https://www.npmjs.com/package/@bigdreamsweb3/wordbin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/node/v/@bigdreamsweb3/wordbin?style=flat-square)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen?style=flat-square)](https://github.com/bigdreamsweb3/wordbin/actions)

**WordBin** encodes short human-readable phrases — crypto seeds, metadata tags, labels, keywords — into **compact, deterministic binary payloads** that can be perfectly reversed back to the original words.

Designed for **Web3 metadata**, **QR codes**, **blockchain events**, **IoT**, **NFC tags**, **short URLs**, and any **low-bandwidth or storage-constrained** environment where every byte matters.

---

### Real Output

```
Input  : "stock ridge avoid school honey trap wait wheel worry face differ wedding"
Words  : 12
Output : 34 bytes  (original: 72 bytes)
Saved  : 38 bytes  —  47% of original size

Hex    : 0108c424409e363270f7d64deba55e2e11ba716eba59926de2f50282599fc5afd1a8
Base58 : 2MepGpLHGPPmnrdzjmpqet2XFQ2YGMSpQoDXDex7toUBdZ
Base64 : AQjEJECeNjJw99ZN66VeLhG6cW66WZJt4vUCglmfxa/RqA==
Bin21  : ☺◄Ä$@ž6rp÷ÖMë¥^.►ºqnºY™mâõ☻™Å¯Ñ¨

Decoded: "stock ridge avoid school honey trap wait wheel worry face differ wedding" ✓
```

---

## Why WordBin?

- **40–70% size reduction** on typical short phrases
- **Deterministic** — same input + same dictionary = same output, every time
- **Lossless** — decode is always a perfect round-trip
- **Universal decoder** — accepts hex, Base58, Base64, Bin21, or raw bytes; format is auto-detected
- **Resilient** — non-WordBin payloads are never rejected; partial word extraction is attempted before falling back gracefully
- **No runtime dependencies** — works in Node.js and the browser
- **Flexible dictionaries** — BIP-39 (v1, bundled), large English (v2), or custom wordlists

---

## Install

```bash
npm install @bigdreamsweb3/wordbin
```

> Ships with **v1 (BIP-39, 2048 words)** pre-bundled — works out of the box.

---

## Quick Start

```ts
import { WordBin } from "@bigdreamsweb3/wordbin";

const wb = await WordBin.create();

const phrase =
  "stock ridge avoid school honey trap wait wheel worry face differ wedding";

// ── Encode ────────────────────────────────────────────────────────────────────
const encoded = await wb.encode(phrase);

console.log(encoded.hexPayload); // standard hex string
console.log(encoded.base58Payload); // Base58 string
console.log(encoded.base64Payload); // Base64 string
console.log(encoded.payload); // Bin21 (1 char per byte, most compact printable form)
console.log(encoded.encodedBytes); // 34
console.log(encoded.originalBytes); // 72
console.log(encoded.ratioPercent); // 47.22

// ── Decode — pass any format, it's auto-detected ──────────────────────────────
const r1 = await wb.decode(encoded.hexPayload); // DetectedFormat: "hex"
const r2 = await wb.decode(encoded.base58Payload); // DetectedFormat: "base58"
const r3 = await wb.decode(encoded.base64Payload); // DetectedFormat: "base64"
const r4 = await wb.decode(encoded.payload); // DetectedFormat: "bin21"
const r5 = await wb.decode(encoded.encoded); // DetectedFormat: "bytes" (Uint8Array)

console.log(r1.text); // "stock ridge avoid school honey trap..."
console.log(r1.isWordBin); // true
```

### Browser (ESM)

```html
<script type="module">
  import { WordBin } from "https://esm.sh/@bigdreamsweb3/wordbin";
  const wb = await WordBin.create();
  const { hexPayload } = await wb.encode("abandon ability able");
  const { text } = await wb.decode(hexPayload);
  console.log(text); // → "abandon ability able"
</script>
```

---

## Payload Formats

WordBin produces four interchangeable representations of the same encoded bytes. Pass any of them to `decode()` — the format is detected automatically.

| Format     | Field           | Description                            | Size                             |
| ---------- | --------------- | -------------------------------------- | -------------------------------- |
| **Hex**    | `hexPayload`    | Lowercase hex, 2 chars per byte        | 2× raw                           |
| **Base58** | `base58Payload` | URL-safe, no ambiguous chars (0/O/I/l) | ~1.4× raw                        |
| **Base64** | `base64Payload` | Standard Base64 with `=` padding       | ~1.33× raw                       |
| **Bin21**  | `payload`       | Latin-1 string, 1 char per byte        | 1× raw — smallest printable form |
| **Bytes**  | `encoded`       | Raw `Uint8Array`                       | 1× raw                           |

> **Bin21** is WordBin's signature format: each encoded byte maps to exactly one character. No expansion. A 34-byte payload is a 34-character string.

---

## Decode API

`wb.decode(payload)` always returns a `DecodeResult` — it never throws.

```ts
interface DecodeResult {
  text: string; // decoded words, or best-effort extraction
  isWordBin: boolean; // true = valid WordBin payload, perfectly decoded
  detectedFormat: PayloadFormat; // "hex" | "base58" | "base64" | "bin21" | "bytes"
  notice?: string; // present when payload is not a valid WordBin stream
  rawSegments?: string[]; // unmatched bytes shown as [0xXX], non-WordBin only
}
```

### Decode behaviour

```
Payload received
      │
      ▼
Format detection ──── hex / base58 / base64 / bin21 / bytes
      │
      ▼
Strict WordBin parse (all installed dictionary versions)
      │                      │
   Success               Failure
      │                      │
  isWordBin: true       Partial scan ── extract words where bytes match
  text: original            │           preserve unmatched bytes as [0xXX]
                        isWordBin: false
                        notice: explains what happened
```

**Any payload is accepted.** If bytes don't match any dictionary, a partial word extraction is attempted across all installed dictionaries. Remaining bytes are preserved as `[0xXX]` markers so nothing is silently discarded.

```ts
// Non-WordBin payload — still handled gracefully
const result = await wb.decode("48656c6c6f20576f726c64"); // "Hello World" as hex

console.log(result.isWordBin); // false
console.log(result.notice); // "This does not appear to be a valid WordBin payload..."
console.log(result.rawSegments); // ["[0x48]", "[0x65]", ...] — unmatched bytes
```

---

## How Encoding Works

1. **Version header** — first byte identifies the dictionary version (`0x01` for v1)
2. **Dictionary lookup** — each word in the phrase is replaced by its compact binary ID (1–4 bytes)
3. **Literal fallback** — words not in the dictionary are stored as `varint length + UTF-8 bytes`
4. **Payload representations** — the raw bytes are encoded into hex, Base58, Base64, and Bin21

Payloads are **self-describing** (the version byte is embedded) and **fully lossless**.

---

## Compression by Use Case

| Use case                   | Words | Original    | Encoded     | Saved |
| -------------------------- | ----- | ----------- | ----------- | ----- |
| 12-word BIP-39 seed phrase | 12    | ~72 bytes   | ~34 bytes   | ~53%  |
| Crypto metadata / labels   | 5–8   | 30–50 bytes | 12–24 bytes | ~55%  |
| Short tag / keyword list   | 3–6   | 20–40 bytes | 8–18 bytes  | ~60%  |
| English sentence           | 8–15  | 50–90 bytes | 25–45 bytes | ~50%  |

---

## CLI — Build Dictionaries

```bash
# Interactive
npx wordbin build

# Specific version
npx wordbin build --version 1          # BIP-39 (2048 words, already bundled)
npx wordbin build --version 2          # dwyl/english-words (~466k words)
npx wordbin build --all                # Build v1 and v2

# Custom wordlist
npx wordbin build --custom ./mywords.txt
npx wordbin build --custom https://example.com/words.txt
```

Output goes to `./data/`. Load with `loadDictionaryByVersion()` or pass directly to `new WordBin(dict)`.

---

## Dictionary Versions

| Version    | Words    | Source             | Best for                                | Bundled        |
| ---------- | -------- | ------------------ | --------------------------------------- | -------------- |
| **v1**     | 2,048    | BIP-39 English     | Crypto seeds, maximum reliability       | ✅ Yes         |
| **v2**     | ~466,550 | dwyl/english-words | General English, tags, large vocabulary | Build required |
| **Custom** | Any      | Your wordlist      | Domain-specific vocabulary              | Build required |

---

## Advanced Usage

### Load a specific dictionary version

```ts
import { loadDictionaryByVersion, WordBin } from "@bigdreamsweb3/wordbin";

const dict = await loadDictionaryByVersion(1);
const wb = new WordBin(dict);
```

### Encode with a specific dictionary version

```ts
const encoded = await wb.encode("abandon ability able", { dictVersion: 1 });
```

### Encode from an existing EncodeResult or raw bytes

```ts
// Re-encode a previous result (e.g. to switch dictionary version)
const reEncoded = await wb.encode(encoded);

// Encode raw bytes
const fromBytes = await wb.encode(new Uint8Array([1, 2, 3]));
```

### Build a WordBin instance from a custom wordlist

```ts
const wb = await WordBin.createFromWords(["apple", "banana", "cherry", ...]);
```

---

---

## For Contributors — Clone & Run Locally

> This section is for people developing WordBin itself.  
> If you're just using the package, `npm install @bigdreamsweb3/wordbin` is all you need.

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Clone and set up

```bash
git clone https://github.com/bigdreamsweb3/wordbin.git
cd wordbin
npm install
```

### Project layout

```
wordbin/
├── src/
│   ├── core/           # WordBin class — encode, decode, format detection
│   ├── dict/           # Dictionary loader, builder, and bundled data
│   ├── utils/          # Buffer helpers (toHex, toBase64, varint, utf8)
│   └── constants.ts    # LITERAL token and other shared constants
├── test/
│   └── test.spec.ts    # Vitest suite — encode, decode, round-trip, non-WordBin
├── data/               # Built dictionary files (generated, not committed)
└── dist/               # Compiled output (generated on build)
```

### Build

```bash
npm run build        # compile TypeScript → dist/
```

### Run the tests

```bash
npm test             # run all test suites once
npm run test:watch   # watch mode — re-runs on file save
```

Each suite can be run independently — either flip a flag in `test/test.spec.ts`:

```ts
const RUN = {
  ENCODE_ONLY: true, // set false to skip
  DECODE_ONLY: true,
  ENCODE_THEN_DECODE: true,
  NON_WORDBIN_DECODE: true,
};
```

Or target a suite by name from the CLI:

```bash
npx vitest -t "Encode only"
npx vitest -t "Decode only"
npx vitest -t "Encode then decode"
npx vitest -t "Non-WordBin decode"
```

### Build dictionaries locally

The v1 BIP-39 dictionary is bundled with the package. To build additional versions:

```bash
npx wordbin build --version 2    # large English (~466k words) → ./data/
npx wordbin build --all          # v1 + v2
```

The `./data/` directory is gitignored. Built dictionaries are loaded automatically by `loadLatestDictionary()` at runtime.

### Making changes

The most common contribution points:

| What you want to change                    | Where to look                                            |
| ------------------------------------------ | -------------------------------------------------------- |
| Encode / decode logic                      | `src/core/wordbin.ts`                                    |
| Format detection (hex/base58/base64/bin21) | `detectAndConvert()` in `wordbin.ts`                     |
| Dictionary loading / versioning            | `src/dict/dictionary-loader.ts`                          |
| Dictionary building from a wordlist        | `src/dict/builder.ts`                                    |
| Buffer utilities (varint, hex, utf8)       | `src/utils/buffer.ts`                                    |
| Add a new payload format                   | `PayloadFormat` type + `detectAndConvert()` + `encode()` |

### Submitting a pull request

1. Fork the repo and create a branch: `git checkout -b my-feature`
2. Make your changes and ensure all tests pass: `npm test`
3. Add or update tests for any new behaviour in `test/test.spec.ts`
4. Open a pull request with a clear description of what changed and why

For larger changes — new dictionary versions, new payload formats, architectural changes — please open an issue first to discuss the approach.

---

## License

MIT — see [LICENSE](./LICENSE) for details.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to add dictionary versions, improve compression, or fix bugs.

---

Enjoy the tiny payloads. We up 🚀
