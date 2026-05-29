# Public API Guide

SmartRecipe can be used as a CLI or as a TypeScript library. The public package exports are organized by task so callers can use one layer without importing the whole CLI.

## Package Exports

```ts
import { generateSmartRecipe, uploadSmartRecipe } from "smart-recipe/pipeline";
import { detectRecipeSource, fetchRecipeSourceWithRaw } from "smart-recipe/sources";
import { createDeviceApi, getDeviceAdapter } from "smart-recipe/devices";
import { RecipeInputSchema, formatRecipeTerminal } from "smart-recipe/recipes";
```

Main subpaths:

- `smart-recipe/sources`: detect and retrieve web, Monsieur Cuisine, and Cookidoo recipe sources.
- `smart-recipe/pipeline`: generate and upload recipes as separate workflow phases.
- `smart-recipe/devices`: unified device API and adapters for Monsieur Cuisine and Thermomix.
- `smart-recipe/mc`: low-level Monsieur Cuisine API client, auth helpers, and upload support.
- `smart-recipe/tm`: low-level Cookidoo/Thermomix API client, payload creation, schema, and upload support.
- `smart-recipe/recipes`: generic Monsieur Cuisine recipe schema, validation, payload creation, and terminal formatting.
- `smart-recipe/retriever`: unauthenticated web page extraction.
- `smart-recipe/llm`: OpenAI recipe and image generation primitives.

## Source Retrieval

Use `detectRecipeSource()` when accepting arbitrary user input:

```ts
import { detectRecipeSource, fetchRecipeSourceWithRaw } from "smart-recipe/sources";

const source = detectRecipeSource("https://cookidoo.de/recipes/recipe/de-DE/r776048");
const { raw, page } = await fetchRecipeSourceWithRaw(source, {
  cookies: { tm: process.env.TM_COOKIE },
  // Source API locale. Cookidoo URLs usually carry this already; pass it for IDs.
  locale: "de-DE",
  includeImageBytes: true,
});

console.log(page.title);
console.log(page.markdown);
```

Supported sources:

- Web pages: `https://example.com/recipe`
- Monsieur Cuisine recipe URLs: `https://www.monsieur-cuisine.com/de/create-recipe?devices=mc-smart&recipe-id=10408588`
- Cookidoo official recipe URLs or IDs: `https://cookidoo.de/recipes/recipe/de-DE/r776048`, `r776048`
- Cookidoo created recipe URLs or IDs: `https://cookidoo.de/created-recipes/de-DE/01K...`

Authentication:

- Monsieur Cuisine source retrieval needs `cookies.mc`.
- Cookidoo source retrieval needs `cookies.tm`.
- Web retrieval does not need a cookie.

`fetchRecipeSourceAsPage()` returns only the normalized `RetrievedRecipePage`. `fetchRecipeSourceWithRaw()` returns both the raw API object and the normalized page. Use the latter when you want to inspect or render the original MC/Cookidoo recipe.

## Generate Then Upload

The recommended workflow is two-phase: retrieve, generate, inspect, then upload.

```ts
import { detectRecipeSource, fetchRecipeSourceAsPage } from "smart-recipe/sources";
import { generateSmartRecipe, uploadSmartRecipe } from "smart-recipe/pipeline";
import { getDeviceAdapter } from "smart-recipe/devices";

const source = detectRecipeSource("https://example.com/recipe");
const page = await fetchRecipeSourceAsPage(source, {
  cookies: {
    mc: process.env.MC_COOKIE,
    tm: process.env.TM_COOKIE,
  },
  locale: "de-DE",
});

const adapter = getDeviceAdapter("tm");
const generated = await generateSmartRecipe({
  page,
  adapter,
  // Target recipe locale/language.
  locale: "de-DE",
  openAIModel: "gpt-5.5",
  reasoningEffort: "medium",
});

console.log(adapter.formatInputForTerminal(generated.recipeInput));

const uploaded = await uploadSmartRecipe({
  ...generated,
  adapter,
  locale: "de-DE",
  cookie: process.env.TM_COOKIE,
});

console.log(uploaded.recipeUrl);
```

For Monsieur Cuisine, use `getDeviceAdapter("mc")` and pass an MC cookie to `uploadSmartRecipe`.

## Chrome Extension Style Usage

A browser extension usually should not use the CLI login flow. It can pass cookies it already has permission to read, or send the URL/content to a backend that owns the session.

```ts
import { detectRecipeSource, fetchRecipeSourceAsPage } from "smart-recipe/sources";
import { generateSmartRecipe } from "smart-recipe/pipeline";
import { getDeviceAdapter } from "smart-recipe/devices";

export async function importFromCurrentTab(url: string, cookies: { mc?: string; tm?: string }) {
  const source = detectRecipeSource(url);
  const page = await fetchRecipeSourceAsPage(source, {
    cookies,
    locale: "de-DE",
    includeImageBytes: false,
  });

  const adapter = getDeviceAdapter("mc");
  return generateSmartRecipe({
    page,
    adapter,
    locale: "de-DE",
  });
}
```

For pages where the extension has already extracted text itself, skip source retrieval and pass a `RetrievedRecipePage` directly to `generateSmartRecipe`.

## Unified Device API

For application code, prefer `createDeviceApi()` over the raw vendor clients. It exposes the same method names for both devices; only the returned payload types differ.

```ts
import { createDeviceApi } from "smart-recipe/devices";

const mc = createDeviceApi({
  device: "mc",
  cookie: process.env.MC_COOKIE,
  locale: "de-DE",
});

const tm = createDeviceApi({
  device: "tm",
  cookie: process.env.TM_COOKIE,
  locale: "de-DE",
});

const mcProfile = await mc.getProfile();
const tmProfile = await tm.getProfile();

const mcRecipes = await mc.listRecipes({ size: 20 });
const tmRecipes = await tm.listRecipes({ size: 20 });

const mcRecipe = await mc.getRecipe({ id: "10408588" });
const tmRecipe = await tm.getRecipe({ id: "01KSSGVJPJY3SQ8WXXQTKSFESF" });
const publicTmRecipe = await tm.getRecipe({ id: "01KSSGVJPJY3SQ8WXXQTKSFESF", public: true });
```

Common methods:

- `getProfile()`
- `listRecipes({ page?, size? })`
- `getRecipe({ id, public? })`
- `validateInput(input)`
- `normalizeInput(input)`
- `formatInputForTerminal(input)`
- `createPayload(input)`
- `uploadRecipe({ page, recipeInput, payload?, imageProvider?, authProvider? })`
- `browserLogin(options)`

This facade intentionally hides vendor naming differences such as MC proxy endpoints versus Cookidoo created/public/official recipe routes.

## Raw Vendor APIs

Use the lower-level clients only when you need vendor-specific behavior that the unified device API does not expose.

```ts
import { MonsieurCuisineApi } from "smart-recipe/mc";
import { ThermomixApi } from "smart-recipe/tm";

const mc = new MonsieurCuisineApi({ cookie: process.env.MC_COOKIE });
const mcRecipe = await mc.getRecipe(10408588);

const tm = new ThermomixApi({ cookie: process.env.TM_COOKIE, locale: "de-DE" });
const official = await tm.getOfficialRecipe("r776048");
const created = await tm.getCreatedRecipe("01KSSGVJPJY3SQ8WXXQTKSFESF");
```

These clients return source API payloads and follow vendor-specific concepts. Use `smart-recipe/devices` for consistent device workflows, or `smart-recipe/sources` if you want conversion into the common `RetrievedRecipePage` shape.

## Error Handling

Authenticated source retrieval throws when the matching cookie is missing or expired:

- Missing MC cookie: source ingestion requires an MC cookie.
- Missing Cookidoo cookie: source ingestion requires a Thermomix/Cookidoo cookie.
- Expired sessions usually surface as `MonsieurCuisineApiError` or `CookidooError` with `401` / `403`.

The CLI catches these cases and can open browser login interactively. Library callers should decide how to obtain or refresh cookies in their own application.
