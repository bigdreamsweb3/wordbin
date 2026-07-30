# Changelog

All notable changes to WordBin are documented in this file.

## [1.4.0] - 2026-07-22

### Added

- Lossless recovery metadata for non-WordBin payloads, including original hex bytes, offset-aware segments, recovery mode, dictionary version, and confidence.
- Optional dictionary selection for best-effort recovery through `decode(payload, { dictVersion })`.
- Regression coverage for variable-length ID prefixes, `0xff`-prefixed IDs, malformed literals, arbitrary binary, Unicode literals, and headerless recovery.

### Improved

- Recover exact dictionary IDs using whole-payload dynamic programming instead of committing to an early greedy match.
- Score recovery candidates by exact-match information so large dictionaries do not automatically dominate smaller, more specific dictionaries.
- Preserve readable UTF-8 exactly, including case and punctuation.
- Preserve unmatched binary as deterministic `[hex:...]` segments that reconstruct the complete original payload.
- Cache loaded dictionary maps for faster repeated encoding and decoding.

### Fixed

- Unknown and header-only one-byte payloads are no longer reported as valid WordBin streams.
- Valid phrases containing variable-length ID prefix conflicts, such as `lab acid`, now round-trip correctly.
- BIP-39 words whose IDs begin with the `0xff` literal marker now decode correctly.
- Invalid UTF-8 no longer loses information through Unicode replacement characters.
- Malformed and non-canonical literal blocks no longer pass strict decoding.

### Documentation

- Added seed-phrase, private-key, and keypair byte-size comparisons.
- Documented the structured, lossless non-WordBin recovery API.

### Compatibility

- Valid WordBin encoding and decoding remain compatible.
- New `DecodeResult` properties are optional at the type level for compatibility with existing mocks and manually constructed results.
- Non-WordBin fallback text now uses `[hex:...]` instead of the legacy `[raw:...]` representation.
