# Technical Notes

This document collects implementation-oriented notes for contributors and library users. The main README is intentionally user-facing.

## Modules

- `smart-recipe/recipes`: strongly typed recipe input, Smart mode helpers, validation, raw payload creation, and `formatRecipeTerminal` for terminal pretty-printing.
- `smart-recipe/catalogs`: locale catalog data. Six locales (`de-DE`, `en-US`, `fr-FR`, `it-IT`, `pl-PL`, `cs-CZ`) ship with verified category and complexity IDs.
- `smart-recipe/devices`: unified `DeviceAdapter` abstraction (`MonsieurCuisineAdapter` and `ThermomixAdapter`) mapping device schemas, constraints, normalization rules, and API clients.
- `smart-recipe/retriever`: recipe-page retrieval, Markdown conversion and preview image candidate selection.
- `smart-recipe/llm`: OpenAI recipe and image generation using centralized prompt builders, the model-facing JSON schema and a validation repair loop.
- `smart-recipe/mc`: Monsieur Cuisine Smart client, browser login, and draft upload.
- `smart-recipe/tm`: Thermomix Cookidoo client, authentication proxy, and draft upload.
- `smart-recipe/pipeline`: two-phase import pipeline — `generateSmartRecipe` and `uploadSmartRecipe` — plus the legacy combined `importRecipe` / `importRecipeFromUrl` wrappers.

## CLI Architecture

The CLI (`src/cli/main.ts`) implements an interactive wizard for the `import-url`, `import-file`, and `import-stdin` commands via `runImport`. The wizard runs only when stdout and stdin are both TTYs and `--json` is not set. In non-interactive contexts (CI, pipes, `--json`) all prompts are skipped and the old flag-driven behaviour applies.

**Wizard steps:**

1. **Target device** — if not set, prompts to choose between `mc` and `tm` (and specific Thermomix model: `tm6` or `tm5`), offering to persist settings to `~/.smart-recipe`.
2. **OpenAI key** — checks `OPENAI_API_KEY`; if missing, prompts with `password()`, validates format (`sk-…` / `proj-…`), and offers to persist to `~/.smart-recipe` via `upsertDotEnvValue`.
3. **Generate** — calls `generateSmartRecipe` (LLM only, no upload), then immediately renders with `formatRecipeTerminal`.
4. **Upload decision** — flag precedence: `--dry-run` > `--yes` > `confirm()` prompt (default: no) > safe no-upload default.
5. **Auth resolution** — if no cookie is present for the target cooker, `select()` offers browser login or manual paste; browser failure auto-falls back to manual paste with step-by-step instructions.
6. **Cookie persistence** — offered after both auth paths.
7. **Upload** — calls `uploadSmartRecipe`, prints the draft URL.

## Pipeline Split

`src/pipeline/import-url.ts` exposes two focused functions:

```ts
generateSmartRecipe(options: GenerateSmartRecipeOptions): Promise<GenerateSmartRecipeResult>
uploadSmartRecipe(options: UploadSmartRecipeOptions):   Promise<UploadSmartRecipeResult>
```

This lets callers (the CLI wizard, tests, library users) pause between generation and upload, inspect or modify the recipe, and decide whether to proceed. The combined `importRecipe` and `importRecipeFromUrl` functions remain for backward compatibility.

## Terminal Pretty-Printer

`formatRecipeTerminal(recipe: RecipeInput): string` renders a recipe to a colour-coded, ANSI-formatted string. It is locale-aware (reads `recipe.settings.locale`) and translates:

- Complexity levels, nutrient names, time units, and mode names.
- Rotation direction as purpose-driven labels (e.g. `Stir (Reverse)` / `Chop (Forward)`) rather than mechanical terms.

Output is structured with 2-space → 4-space → 6-space indentation for title/metadata, section headers, and nested content respectively.

## Image Generation

The retrieval and pipeline layers pass image candidates through a narrow `RecipeImageProvider` interface. The default provider uploads the best retrieved image, while `OpenAIRecipeImageGenerator` can replace it without changing the recipe or Monsieur Cuisine client APIs.

Image prompt wording lives in `smart-recipe/llm` with the other prompt builders. The image generator handles OpenAI transport, source image upload and returned image bytes.

## Device Adapters & Cookidoo Image Uploads

The application supports uploading recipes and images to both Monsieur Cuisine and Thermomix (Cookidoo) platforms:
- **Monsieur Cuisine**: Images are uploaded to a native media endpoint and stored as a structured `detailsMediaId`/`thumbnailMediaId`.
- **Thermomix (Cookidoo)**: Images are uploaded directly to Cookidoo's Cloudinary storage (within their `vorwerk-users-gc` cloud name).
  - To support the square-only image cropping constraint on Cookidoo without losing the original image, the library parses image buffers at the binary level (extracting PNG or JPEG dimensions without third-party libraries).
  - It then calculates the largest centered square coordinates (`x,y,w,h`) and uploads the raw image file to Cloudinary along with the calculated `custom_coordinates` parameter (signed by the Cookidoo backend).
  - This allows the Cookidoo UI/Cloudinary CDN to dynamically render the cropped square image without destructively cropping the master image asset, preserving the original resolution and allowing adjustments in the Cookidoo recipe editor later.

## Smart Modes

The schema describes model-friendly mode names and their ranges. The library converts them to the raw site payload:

- `manualCooking`
- `turbo`
- `scale`
- `roast`
- `solidDoughKnead`
- `softDoughKnead`
- `liquidDoughKnead`
- `steam`
- `sousVide`
- `slowCooking`
- `cookingEggs` with `soft | waxy_soft | hard`
- `precleaning`
- `fermentation`
- `riceCooking`
- `foodProcessor`
- `puree`
- `smoothie`
- `none` for plain instruction steps

## Build And Test

```bash
npm run typecheck
npm test
npm run build
```

Before publishing, inspect the package contents:

```bash
npm pack --dry-run
```

## Regenerating the README Previews

`docs/terminal-preview.svg` and `docs/wizard-preview.svg` are static SVGs generated using `ansi-to-svg`. Regenerate them after changing `src/recipes/printer.ts` or the script itself:

```bash
# Pull ansi-to-svg into a temporary directory (not saved as a project dep)
mkdir -p /tmp/svg-gen && cd /tmp/svg-gen && npm init -y -q > /dev/null && npm install ansi-to-svg -q
cd -   # back to project root

# Generate both SVGs
NODE_PATH=/tmp/svg-gen/node_modules npx tsx scratch_generate_terminal_svg.ts
```

Commit `docs/terminal-preview.svg` and `docs/wizard-preview.svg` alongside any printer or wizard CLI changes.
