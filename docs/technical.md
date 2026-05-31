# Technical Notes

This document collects implementation-oriented notes for contributors and library users. The main README is intentionally user-facing.

## Modules

- `smart-recipe/recipes`: strongly typed recipe input, Smart mode helpers, validation, raw payload creation, and `formatRecipeTerminal` for terminal pretty-printing.
- `smart-recipe/catalogs`: locale catalog data. Six locales (`de-DE`, `en-US`, `fr-FR`, `it-IT`, `pl-PL`, `cs-CZ`) ship with verified category and complexity IDs.
- `smart-recipe/devices`: unified `DeviceApi` facade plus the lower-level `DeviceAdapter` abstraction (`MonsieurCuisineAdapter` and `ThermomixAdapter`) mapping device schemas, constraints, normalization rules, and API clients.
- `smart-recipe/retriever`: recipe-page retrieval, semantic JSON-LD extraction, Markdown conversion and preview image candidate selection.
- `smart-recipe/sources`: source detection and retrieval for generic web pages, Monsieur Cuisine recipe URLs, Cookidoo official recipes, and Cookidoo created recipes. It converts all supported sources into `RetrievedRecipePage` markdown for LLM conversion, and can also return the raw source API object for inspection/pretty-printing.
- `smart-recipe/llm`: OpenAI recipe and image generation using centralized prompt builders, the model-facing JSON schema and a validation repair loop.
- `smart-recipe/mc`: Monsieur Cuisine Smart client, browser login, and draft upload.
- `smart-recipe/tm`: Thermomix Cookidoo client, authentication proxy, and draft upload.
- `smart-recipe/pipeline`: two-phase import pipeline — `generateSmartRecipe` and `uploadSmartRecipe` — plus the legacy combined `importRecipe` / `importRecipeFromUrl` wrappers.

## CLI Architecture

The CLI (`src/cli/main.ts`) implements an interactive wizard for the `import-url` / `create`, `import-file` / `create-file`, and `import-stdin` / `create-stdin` commands via `runImport`. The wizard runs only when stdout and stdin are both TTYs and `--json` is not set. In non-interactive contexts (CI, pipes, `--json`) all prompts are skipped and flag-driven behaviour applies.

**Wizard steps:**

1. **Source retrieval** — detects `web`, `mc`, `cookidoo-official`, or `cookidoo-created` input. Web pages are scraped; MC/Cookidoo sources are fetched through authenticated APIs and converted into LLM markdown.
2. **Target device** — if not set, prompts to choose between `mc` and `tm` (and specific Thermomix model: `tm7`, `tm6`, or `tm5`), offering to persist settings to `~/.smart-recipe`.
3. **OpenAI key** — checks `OPENAI_API_KEY`; if missing, prompts with `password()`, validates format (`sk-…` / `proj-…`), and offers to persist to `~/.smart-recipe` via `upsertDotEnvValue`.
4. **Accessory capability** — for Monsieur Cuisine, prompts for the optional food processor/cutter attachment when needed and persists `MC_HAS_FOOD_PROCESSOR`; missing attachment support excludes `foodProcessor` mode from generation.
5. **Generate** — calls `generateSmartRecipe` (LLM only, no upload), then immediately renders with the target adapter's terminal formatter.
6. **Upload decision** — flag precedence: `--dry-run` > `--always-upload` > `confirm()` prompt (default: no) > safe no-upload default.
7. **Image decision** — if uploading, prompts whether to use a source image, upload without an image, generate a fresh image, or generate with source images as visual references. Flags such as `--use-source-image`, `--no-image`, `--recreate-image`, and `--recreate-image-with-source-images` skip this prompt.
8. **Auth resolution** — if no cookie is present for the target cooker, `select()` offers browser login or manual paste; browser failure auto-falls back to manual paste with step-by-step instructions.
9. **Cookie persistence** — offered after both auth paths.
10. **Upload** — calls `uploadSmartRecipe`, prints the draft URL.

Interactive human runs use CLI-only spinners for slow network boundaries: OpenAI recipe generation, OpenAI image generation, and browser login. Spinners are disabled for `--json`, non-TTY use, and explicit log output so machine-readable output and logs do not collide.

The top-level CLI entry point is also the error boundary. Known domain errors (`MonsieurCuisineApiError`, `CookidooError`, `AuthFlowError`) are rendered as short user-facing messages without raw stack traces. Passing `--debug` includes response bodies and stack traces.

The `retrieve` command has a separate display flow:

- For web pages, it prints the extracted markdown and image candidates.
- For MC/Cookidoo source recipes, it fetches the raw source API object and pretty-prints it through the matching device formatter.
- `--markdown` switches back to the intermediate LLM markdown view.
- Missing or expired source sessions prompt for browser login and retry once in interactive terminals.

Other inspection commands:

- `doctor`: checks local configuration, cookie presence, and optionally the live session.
- `me` / `profile`: shows the current account/session profile. Thermomix output includes saved searches, accessories, food preferences, thermomixes, and metadata.
- `recipes` / `drafts`: lists visible recipes with IDs, status, URLs, image/hint flags, and counts where available.
- `recipe` / `get-recipe`: fetches and pretty-prints one recipe. `--input` prints mapped internal recipe input JSON.

## Device API Layers

The public device API is intentionally layered:

- `createDeviceApi({ device, cookie, locale })`: recommended for application code. It exposes the same method names for MC and TM: `getProfile`, `listRecipes`, `getRecipe`, `validateInput`, `normalizeInput`, `formatInputForTerminal`, `createPayload`, `uploadRecipe`, and `browserLogin`.
- `DeviceAdapter<TInput, TPayload>`: internal workflow abstraction used by the pipeline and CLI. It keeps generation, validation, payload creation, terminal formatting, and upload behind one interface. The adapter contract uses `DevicePromptOptions`, `RecipeUploadLogger`, `AuthProvider`, and `RecipeImageProvider<TInput>` rather than untyped option bags.
- Raw vendor clients: `MonsieurCuisineApi` / `MonsieurCuisineSmartClient` and `ThermomixApi` / `CookidooApi`. These expose vendor-shaped methods and may differ because the underlying APIs differ.

Prefer `createDeviceApi` in docs and examples unless the caller needs vendor-specific behavior such as Cookidoo official recipe retrieval or direct MC proxy access.

## Source Ingestion

`detectRecipeSource(input, { source })` normalizes the URL/ID and returns one of:

- `{ type: "web", url }`
- `{ type: "mc", id, url? }`
- `{ type: "cookidoo-official", id, locale?, url? }`
- `{ type: "cookidoo-created", id, public?, locale?, url? }`

`fetchRecipeSourceAsPage(source, options)` returns a `RetrievedRecipePage` for LLM conversion. `fetchRecipeSourceWithRaw(source, options)` returns `{ raw, page }`, which the CLI uses to pretty-print authenticated MC/Cookidoo sources without reparsing markdown.

For generic web pages, the retriever does more than plain text extraction. It scans `application/ld+json` blocks, traverses nested JSON-LD and `@graph` arrays, finds objects with `@type: "Recipe"`, and formats structured `recipeIngredient` / `recipeInstructions` data into Markdown. That structured recipe block is prepended to the extracted page markdown so the LLM sees semantic recipe data even when the visible page text is noisy.

Authenticated sources use source cookies, separate from upload cookies:

- `options.cookies.mc` for Monsieur Cuisine source retrieval.
- `options.cookies.tm` for Cookidoo/Thermomix source retrieval.
- CLI options map to these via `--mc-source-cookie`, `--tm-source-cookie`, or `--source-cookie`.

Generation/upload locale is target-specific and separate from source retrieval locale. The CLI accepts `--locale` / `--language` for the generated recipe and asks interactively when no `MC_LOCALE` or `TM_LOCALE` is configured. Full locale tags and supported two-letter aliases are accepted (`de`, `en`, `fr`, `it`, `pl`, `cs`). `--source-locale` controls authenticated source API calls only when the source URL or ID does not already provide a locale.

Cookidoo official recipe payloads can arrive in grouped API form (`recipeIngredientGroups` / `recipeStepGroups`) rather than JSON-LD form (`recipeIngredient` / `recipeInstructions`). The Cookidoo formatter and mapper normalize both shapes.

## Validation Boundaries

SmartRecipe uses separate validation boundaries for model output, device payloads, and vendor API responses:

- **Model output**: LLM JSON is validated against the model-facing `RecipeInputSchema` or `CookidooRecipeInputSchema`. Errors returned to the LLM stay as compact JSON pointer strings.
- **Human diagnostics**: CLI validation output can include `better-ajv-errors` formatted messages for readable property-level debugging.
- **Device payloads**: Monsieur Cuisine payloads are validated before upload so payload-builder regressions fail locally.
- **Vendor responses**: Selected MC and Cookidoo response shapes are validated with Typebox/AJV immediately after network receipt. Schemas are intentionally tolerant of extra vendor fields but strict about fields SmartRecipe consumes, such as recipe IDs, list containers, media upload URLs, image signatures, and Cloudinary upload IDs.

AJV schemas are compiled once at module scope and reused across validation calls. This matters because LLM repair loops may validate several failed attempts before succeeding.

## Pipeline Split

`src/pipeline/import-url.ts` exposes two focused functions:

```ts
generateSmartRecipe(options: GenerateSmartRecipeOptions): Promise<GenerateSmartRecipeResult>
uploadSmartRecipe(options: UploadSmartRecipeOptions):   Promise<UploadSmartRecipeResult>
```

This lets callers (the CLI wizard, tests, library users) pause between generation and upload, inspect or modify the recipe, and decide whether to proceed. The combined `importRecipe` and `importRecipeFromUrl` functions remain for backward compatibility.

`importRecipeFromUrl` also accepts `source`, `sourceType`, and `sourceCookies`, so library callers can feed Cookidoo or Monsieur Cuisine recipe URLs into the same conversion workflow.

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
