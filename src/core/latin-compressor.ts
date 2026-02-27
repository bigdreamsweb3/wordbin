export class SimpleLatinShortener {
  // Manual mappings — expand this list gradually as you discover new expensive chars
  private manualMap: Record<string, string> = {
    // Visible Latin-1 / accented characters
    "½": "!",
    "ñ": "@",
    "¥": "#",
    "£": "$",
    "ƒ": "%",
    "ð": "&",
    "¯": "/",
    "´": "0",

    // Low control characters (0x00–0x1F) — protect against corruption
    "\u0002": "b",
    "\u0006": "'",
    "\u0008": "v", // BACKSPACE (\b)
    "\u000d": "-", // CARRIAGE RETURN (\r)
    "\u0015": "*",
    "\u0016": "p", // SYNCHRONOUS IDLE (\u0016)
    "\u001a": "2",
    "\u001c": "=",

    // Broken bar and other symbols
    "¦": ":",

    // (Invisible) Expensive characters
    "\u008d": "o", // 141
    "\u0094": "q", // 148

    "\u00b7": "s", // 183 - add your replacement
    "\u00c8": "d", // 200 - add your replacement
    "\u00bc": "w", // 188

    "\u009e": "x", // 158 - add your replacement
    "\u0095": "z", // 149 - add your replacement
    "\u009c": "y", // 156 - add your replacement

    "\u0089": "i", // 137
    "\u0099": "n", // 153
  };

  // Reverse lookup — only for manual mappings
  private reverseMap = new Map<string, string>();

  constructor() {
    for (const [orig, repl] of Object.entries(this.manualMap)) {
      if (this.reverseMap.has(repl)) {
        console.warn(`Collision on manual replacement '${repl}'`);
      }
      this.reverseMap.set(repl, orig);
    }
  }

  shorten(str: string): string {
    const unmappedExpensive = new Set<string>();

    // Scan and collect ALL expensive (multi-byte UTF-8) characters that are not mapped
    for (const ch of str) {
      if (new TextEncoder().encode(ch).length > 1 && !(ch in this.manualMap)) {
        unmappedExpensive.add(ch);
      }
    }

    // Log them so you can add them to manualMap later
    if (unmappedExpensive.size > 0) {
      console.log("Unmapped expensive characters found (add to manualMap):");
      [...unmappedExpensive].forEach((ch) => {
        const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
        console.log(
          `  "\\u${hex}": "?", // ${ch.charCodeAt(0)} - add your replacement`,
        );
      });
      console.log("---");
    }

    // Perform replacement using only the manual map
    return [...str].map((ch) => this.manualMap[ch] ?? ch).join("");
  }

  restore(str: string): string {
    return [...str].map((ch) => this.reverseMap.get(ch) ?? ch).join("");
  }

  utf8Bytes(str: string): number {
    return new TextEncoder().encode(str).length;
  }

  // Debug/test method
  test(input: string) {
    const short = this.shorten(input);
    const restored = this.restore(short);

    console.log("Original string :", input);
    console.log("Original bytes  :", this.utf8Bytes(input));
    console.log("Shortened       :", short);
    console.log("Short bytes     :", this.utf8Bytes(short));
    console.log("Restored        :", restored);
    console.log("Correct?        :", restored === input);
    console.log("---");
  }
}
