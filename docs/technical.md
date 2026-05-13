# Technical Notes

This document collects implementation-oriented notes for contributors and library users. The main README is intentionally user-facing.

## Modules

- `smart-recipe/recipes`: strongly typed recipe input, Smart mode helpers, validation and raw payload creation.
- `smart-recipe/catalogs`: locale catalog data. German (`de-DE`) category and complexity ids are bundled as verified data.
- `smart-recipe/retriever`: recipe-page retrieval, Markdown conversion and preview image candidate selection.
- `smart-recipe/llm`: OpenAI recipe and image generation using centralized prompt builders, the model-facing JSON schema and a validation repair loop.
- `smart-recipe/mc`: Monsieur Cuisine Smart proxy client, cookie auth and image upload.
- `smart-recipe/pipeline`: end-to-end URL import flow.

## Image Generation

The retrieval and pipeline layers pass image candidates through a narrow `RecipeImageProvider` interface. The default provider uploads the best retrieved image, while `OpenAIRecipeImageGenerator` can replace it without changing the recipe or Monsieur Cuisine client APIs.

Image prompt wording lives in `smart-recipe/llm` with the other prompt builders. The image generator handles OpenAI transport, source image upload and returned image bytes.

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
