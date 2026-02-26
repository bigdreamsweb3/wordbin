# WordBin – Encode words & short phrases into tiny, reversible binary

![npm](https://img.shields.io/npm/v/@bigdreamsweb3/wordbin) ![license](https://img.shields.io/npm/l/@bigdreamsweb3/wordbin) ![node](https://img.shields.io/node/v/@bigdreamsweb3/wordbin)

**WordBin** is a deterministic, reversible word-to-binary encoder/decoder that compresses short human-readable phrases into **tiny, predictable binary payloads**.

Optimized for **Web3, blockchain, QR codes, IoT, URLs, and other space-sensitive applications**, WordBin ensures short sequences of words can be stored efficiently and recovered reliably.

---

## Why WordBin

- Compress short phrases (crypto seeds, tags, keywords) into **2–4 byte IDs per word**.
- Fully **deterministic & collision-safe** — same dictionary = same encoding.
- Minimal payload → perfect for **blockchain metadata, NFC/QR codes, and low-bandwidth IoT**.
- Works in **Node.js & browser**, no runtime dependencies.
- Bundled **small dictionary (BIP-39)** with optional **large/custom dictionaries**.

---

## Quick Install

```bash
npm install @bigdreamsweb3/wordbin
```

> The small **v1 (BIP-39)** dictionary is included — ready to encode/decode immediately.

---

## Quick Start (Node.js / Browser)

```js
import { WordBin } from "@bigdreamsweb3/wordbin";

// Use latest dictionary (v1 bundled, v2 if built)
const wb = await WordBin.create();

const phrase =
  "pet either learn purse candy leader craft undo spoil forum slot spirit";
const encoded = await wb.encode(phrase);

console.log("Base64 payload:", encoded.payload);
// → Base64 payload: Aru6lPEGao2lRWajTRYITVtmNVVD8BWvHGhOtBplWKaJmQ==

console.log("Dictionary Version used (header byte):", encoded.dictVersion);
// → Dictionary Version used (header byte):: 2

console.log("Encoded bytes:", encoded.encodedBytes);
// → Encoded bytes: 34

console.log("Original bytes:", encoded.originalBytes);
// → Original bytes:  70

console.log("Bytes saved:", encoded.bytesSaved);
// → Bytes saved: 36

const decoded = await wb.decode(encoded.encoded);
console.log("Decoded:", decoded); // → "pet either learn purse candy leader craft undo spoil forum slot spirit"
```

### Browser Example

```html
<script type="module">
  import { WordBin } from "https://esm.sh/@bigdreamsweb3/wordbin";
  const wb = await WordBin.create();
</script>
```

---

## CLI – Build Larger or Custom Dictionaries

```bash
# Interactive mode
npx wordbin build

# Direct commands
npx wordbin build --version 1          # BIP-39 (small, bundled)
npx wordbin build --version 2          # dwyl/english-words (~466k)
npx wordbin build --all                # Both v1 + v2
npx wordbin build --custom https://example.com/mywords.txt
npx wordbin build --custom ./my-local-words.txt
```

> All generated files go to `./data/` in your current directory.

---

## Dictionary Versions

| Version | Filename              | Words    | Source             | ID bytes | Best for                                |
| ------- | --------------------- | -------- | ------------------ | -------- | --------------------------------------- |
| v1      | wordbin-v1-bip39.json | 2,048    | BIP-39 English     | ~2       | Crypto recovery seeds, high reliability |
| v2      | wordbin-v2-dwyl.json  | ~479,000 | dwyl/english-words | 2–4      | General English, tags, keywords         |

---

## How It Works

1. Each word is hashed → first **2–4 bytes** = its fixed ID.
2. If the ID is in the dictionary → use the short ID.
   Otherwise → store the word as a compact literal block.
3. Payload begins with one byte: **dictionary version**.
4. Decoding uses the same dictionary to reverse IDs → original words.
5. Backtracking handles any ID length ambiguity → guaranteed correct output.

---

## Real-World Use Cases

| Use Case                              | Typical Savings | Dictionary |
| ------------------------------------- | --------------- | ---------- |
| Crypto recovery phrases (12–24 words) | 50–65%          | v1         |
| Short tags / keywords                 | 40–70%          | v2         |
| Tiny QR codes / NFC labels            | 50–80%          | v1 or v2   |
| Short links / URL-friendly tags       | 45–65%          | v2         |
| On-chain metadata (Ethereum, Solana)  | 40–70%          | v2         |
| LoRa / low-bandwidth IoT labels       | 50–75%          | v2         |
| Offline phrase storage / search       | 35–60%          | v2         |

> Not suitable for long texts, arbitrary binary files, or when dictionaries cannot be shared reliably.

---

## Loading Specific Dictionary Versions

```js
import { loadDictionaryByVersion } from "@bigdreamsweb3/wordbin";

const dictV1 = await loadDictionaryByVersion(1); // always available
const wbV1 = new WordBin(dictV1);

const dictV2 = await loadDictionaryByVersion(2); // throws if not built
```

---

## License

MIT

---

## Contributing

Want to help improve WordBin?
Read our [CONTRIBUTING.md](./CONTRIBUTING.md) guide.
