import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/catalogs/index.ts",
    "src/locales/index.ts",
    "src/llm/index.ts",
    "src/mc/index.ts",
    "src/pipeline/index.ts",
    "src/recipes/index.ts",
    "src/retriever/index.ts",
    "src/cli/main.ts"
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "node20"
});
