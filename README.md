# WordBin – Tiny, Reversible Word-Phrase Encoder

[![npm version](https://img.shields.io/npm/v/@bigdreamsweb3/wordbin?style=flat-square)](https://www.npmjs.com/package/@bigdreamsweb3/wordbin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/node/v/@bigdreamsweb3/wordbin?style=flat-square)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen?style=flat-square)](https://github.com/bigdreamsweb3/wordbin/actions)

**WordBin** encodes short human-readable phrases (crypto seeds, tags, keywords, labels) into **extremely compact, deterministic binary payloads** that can be perfectly reversed.

Optimized for **Web3 metadata**, **QR codes**, **blockchain events**, **IoT**, **NFC**, **short URLs**, and **low-bandwidth environments**.

### Latest Example (real run)

```text
Original text: "poul either learn purse candy leader craft undo spoil forum slot spirit"
Word count: 12
Original length: 71 bytes
Encoded length: 35 bytes
Bytes saved: 36
Compression ratio: 49.3% (51% reduction)
Payload (shortened latin): +c!oq@~jx#Ef$MpvM[f5UC&*/=hN?>eX:zk
Decoded: ✓ Perfect match
```

---

## Why WordBin?

- **~40–70% size reduction** on typical short phrases
- **Deterministic** — same input + same dictionary = same output
- **Collision-free** within a dictionary version
- **Reversible** — lossless decode with the same dictionary
- **Tiny payloads** — ideal for on-chain data, QR/NFC, low-bandwidth
- **No runtime dependencies** — works in Node.js & browser
- **Flexible dictionaries** — BIP-39 (v1), English large (v2), or custom

---

## Quick Install

```bash
npm install @bigdreamsweb3/wordbin
```

> Comes with **v1 (BIP-39)** pre-bundled — ready to use instantly.

---

## Quick Start (Node.js / Browser)

```ts
import { WordBin } from "@bigdreamsweb3/wordbin";

const wb = await WordBin.create(); // uses latest available dictionary

const phrase =
  "poul either learn purse candy leader craft undo spoil forum slot spirit";

const encoded = await wb.encode(phrase, { debug: true });

console.log("Payload (shortened):", encoded.payload);
console.log("Encoded bytes:", encoded.encodedBytes);
console.log("Original bytes:", encoded.originalBytes);
console.log("Bytes saved:", encoded.bytesSaved);
console.log("Compression ratio:", encoded.ratioPercent + "%");

// Decode anywhere (same dictionary)
const decoded = await wb.decode(encoded.payload);
console.log("Decoded:", decoded); // → original phrase
```

### Browser (via ESM)

```html
<script type="module">
  import { WordBin } from "https://esm.sh/@bigdreamsweb3/wordbin";

  const wb = await WordBin.create();
  // ... same as above
</script>
```

---

## CLI – Build & Manage Dictionaries

```bash
# Interactive mode
npx wordbin build

# Common commands
npx wordbin build --version 1          # BIP-39 (2048 words, bundled)
npx wordbin build --version 2          # dwyl/english-words (~466k)
npx wordbin build --all                # Both v1 & v2
npx wordbin build --custom ./mywords.txt
npx wordbin build --custom https://example.com/words.txt
```

Output goes to `./data/` — load with `loadDictionaryByVersion()` or `new WordBin(dict)`.

---

## Dictionary Versions

| Version | Words    | Source             | ID bytes | Best for                        | Included? |
| ------- | -------- | ------------------ | -------- | ------------------------------- | --------- |
| v1      | 2,048    | BIP-39 English     | 1–2      | Crypto seeds, high reliability  | Yes       |
| v2      | ~466,550 | dwyl/english-words | 2–4      | General English, tags, keywords | Build req |
| Custom  | Any      | Your own word list | 2–4      | Domain-specific vocab           | Build req |

---

## How It Works

1. **Dictionary lookup** → common words → short fixed-byte IDs (2–4 bytes)
2. **Fallback literals** → unknown words → compact varint length + UTF-8 bytes
3. **Header** → single byte = dictionary version
4. **Shortening** → optional post-processing replaces expensive multi-byte chars with single-byte ones (via `SimpleLatinShortener`)
5. **Decoding** → reverse IDs → restore literals → backtrack until full match

Payloads are **self-describing** (version byte) and **lossless**.

---

## Real-World Compression Examples

| Phrase Type                  | Words | Original bytes | Encoded bytes | Saved  | Ratio  |
| ---------------------------- | ----- | -------------- | ------------- | ------ | ------ |
| 12-word BIP-39 seed          | 12    | ~70–80         | 28–35         | 50–65% | 50–65% |
| English sentence (this test) | 12    | 71             | 35            | 36     | 49.3%  |
| Short tag/keyword list       | 5–8   | 30–50          | 15–25         | 50–70% | 50–70% |
| Crypto metadata              | 3–10  | 20–60          | 10–30         | 50–70% | 50–70% |

---

## Loading Specific Versions

```ts
import { loadDictionaryByVersion } from "@bigdreamsweb3/wordbin";

const dictV1 = await loadDictionaryByVersion(1); // always available
const wbV1 = new WordBin(dictV1);

const dictV2 = await loadDictionaryByVersion(2); // only if built
```

---

## License

MIT

---

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) to add dictionaries, improve compression, or fix bugs.

---

Enjoy the tiny payloads — we up! 🚀
