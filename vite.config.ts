import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";
import copy from "rollup-plugin-copy";

export default defineConfig({
  build: {
    target: "node18",
    sourcemap: true,
    minify: false,
    emptyOutDir: true,

    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        cli: resolve(__dirname, "src/cli.ts"),
      },
      formats: ["es"],
      fileName: (format, entryName) =>
        entryName === "cli" ? "cli.mjs" : "index.mjs",
    },

    rollupOptions: {
      external: [
        // Node built-ins
        /^node:/,
        "fs",
        "fs/promises",
        "path",
        "url",
        "crypto",
        "util",

        // external deps
        "bip39",
      ],
    },
  },

  plugins: [
    dts({
      entryRoot: "src",
      insertTypesEntry: true,
      exclude: ["**/*.test.ts", "scripts/**/*"],
    }),

    copy({
      targets: [
        {
          // src: "data/**/*",
          src: "data/wordbin-v1-bip39.json",
          dest: "dist/data",
        },
      ],
      hook: "writeBundle",
    }),
  ],
});
