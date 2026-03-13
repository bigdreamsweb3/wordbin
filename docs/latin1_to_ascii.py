"""
Latin-1 → ASCII Mapper
------------------------
Maps every Latin-1 char to an ASCII char via NFKD.
If the ideal NFKD match is already taken, assigns the next
available ASCII char from the pool (in code-point order).

Rules:
  - Each ASCII char is claimed by exactly ONE Latin-1 char → id: 0
  - Priority: NFKD base first, then next free ASCII char
  - Only null if the entire ASCII pool is exhausted (won't happen: 95 ASCII > 134 Latin-1 mapped slots)

Usage:
  python latin1_to_ascii.py <latin1_json> <ascii_json> <output_json>
"""

import json
import unicodedata
from pathlib import Path


def nfkd_base(char: str, valid_ascii: set) -> str | None:
    decomposed = unicodedata.normalize("NFKD", char)
    ascii_only = "".join(c for c in decomposed if c in valid_ascii)
    return ascii_only if len(ascii_only) == 1 else None


def build_mapping(latin1_path: str, ascii_path: str, output_path: str) -> None:
    with open(latin1_path, encoding="utf-8") as f:
        latin1_data = json.load(f)
    with open(ascii_path, encoding="utf-8") as f:
        ascii_data = json.load(f)

    # Ordered pool of ASCII chars (by code-point), excluding space only
    ascii_pool: list[str] = [
        entry["char"]
        for entry in sorted(ascii_data["codes"].values(), key=lambda e: ord(e["char"]))
        if entry["char"] != " "
    ]
    available: list[str] = list(ascii_pool)  # shrinks as chars are claimed
    claimed: set[str] = set()

    def claim(char: str) -> str | None:
        if char in claimed or char not in ascii_pool:
            return None
        claimed.add(char)
        available.remove(char)
        return char

    def next_free() -> str | None:
        return available[0] if available else None

    output_codes = {}
    stats = {"mapped": 0, "null": 0}

    for code_str, entry in latin1_data["codes"].items():
        # 1. Try NFKD base first
        ideal = nfkd_base(entry["char"], set(ascii_pool))
        replacement = None

        if ideal and ideal not in claimed:
            replacement = claim(ideal)
        elif ideal and ideal in claimed:
            # Ideal is taken — grab next free ASCII char
            nxt = next_free()
            if nxt:
                replacement = claim(nxt)
        else:
            # No NFKD base at all — grab next free ASCII char
            nxt = next_free()
            if nxt:
                replacement = claim(nxt)

        output_codes[code_str] = {
            "char":              entry["char"],
            "name":              entry["name"],
            "description":       entry["description"],
            "ascii_replacement": {"id": 0, "char": replacement} if replacement else None,
        }
        if replacement:
            stats["mapped"] += 1
        else:
            stats["null"] += 1

    output = {
        "_comment": (
            "Latin-1 chars mapped to ASCII. NFKD base preferred; "
            "if taken, next free ASCII char assigned. Each ASCII char claimed once (id: 0)."
        ),
        "codes": output_codes,
    }

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    total = stats["mapped"] + stats["null"]
    print(f"Done!  {total} Latin-1 entries processed.")
    print(f"  Mapped : {stats['mapped']}")
    print(f"  Null   : {stats['null']}")
    print(f"  Unclaimed ASCII chars remaining: {len(available)}")
    print(f"  Output : {output_path}")

    print(f"\n--- Mapped entries ({stats['mapped']} total) ---")
    print(f"{'Code':<8} {'Char':<6} {'ASCII':<6} Description")
    print("-" * 60)
    for code_str, entry in output_codes.items():
        if entry["ascii_replacement"] is None:
            continue
        print(f"{code_str:<8} {entry['char']:<6} {entry['ascii_replacement']['char']:<6} {entry['description']}")

    if stats["null"]:
        print(f"\n--- Null entries ({stats['null']} total) ---")
        for code_str, entry in output_codes.items():
            if entry["ascii_replacement"] is not None:
                continue
            print(f"  {code_str}: {entry['char']}  {entry['description']}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Map Latin-1 chars to ASCII. NFKD first, then next free ASCII char."
    )
    parser.add_argument("latin1_json", help="Path to the Latin-1 JSON file")
    parser.add_argument("ascii_json",  help="Path to the ASCII JSON file")
    parser.add_argument("output_json", help="Path for the output JSON file")
    args = parser.parse_args()

    build_mapping(
        latin1_path=args.latin1_json,
        ascii_path=args.ascii_json,
        output_path=args.output_json,
    )