# SmartRecipe

SmartRecipe turns recipe web pages into editable Monsieur Cuisine Smart draft recipes.

Give it a recipe URL and it will:

- read the page and extract the recipe text
- ask OpenAI to adapt the recipe for the Monsieur Cuisine Smart
- create a draft recipe in your Monsieur Cuisine account
- upload a recipe image, either from the source page or newly generated

It is built for Monsieur Cuisine Smart (`MC3.0`). It does not support the older Monsieur Cuisine connect device because user-created recipes do not sync there.

## What You Need

- Node.js 20.18 or newer
- an OpenAI API key
- a Monsieur Cuisine / Lidl Plus account
- a Monsieur Cuisine Smart device

SmartRecipe creates drafts. You should still review the ingredients, steps, cooking times and temperatures before cooking.

## Install

After publishing, install the CLI globally:

```bash
npm install -g smart-recipe
smart-recipe --help
```

From a local checkout:

```bash
npm install
npm run build
node dist/cli/main.js --help
```

The examples below use `smart-recipe`. When running from a checkout, replace it with `node dist/cli/main.js`.

## Set Up OpenAI

Create a `.env` file or export the variable in your shell:

```bash
OPENAI_API_KEY=sk-...
```

The default recipe model is `gpt-5.5`. You can change it with:

```bash
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=medium
```

## Log In To Monsieur Cuisine

The easiest option is the browser login helper:

```bash
smart-recipe login-browser --save
```

This opens a small browser window, lets you complete the normal Lidl Plus login, and saves the session cookie to `~/.smart-recipe`.

You can also pass a cookie directly:

```bash
smart-recipe import-url "https://example.com/recipe" --cookie "..."
```

## Import A Recipe

Start with a dry run. This retrieves the page and generates the recipe, but does not upload anything:

```bash
smart-recipe import-url "https://example.com/recipe" --dry-run
```

To create a Monsieur Cuisine draft:

```bash
smart-recipe import-url "https://example.com/recipe"
```

After the upload, SmartRecipe prints the draft URL. Open it, review the recipe, and adjust anything that needs human judgment.

## Recreate The Image

By default, SmartRecipe uploads the best image it finds on the recipe page.

To avoid reusing the source image, ask OpenAI to create a new one:

```bash
smart-recipe import-url "https://example.com/recipe" --recreate-image
```

The generated image is prompted to look like an ambitious home cook took it with a good phone camera: realistic, expressive and appetizing, but not glossy studio food photography.

You can also send the website images as loose visual context:

```bash
smart-recipe import-url "https://example.com/recipe" --recreate-image-with-source-images
```

This still asks for a new original image. The source images are only used to understand the dish.

Image generation defaults:

```bash
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_QUALITY=medium
```

You can also set them per run:

```bash
smart-recipe import-url "https://example.com/recipe" \
  --recreate-image \
  --image-size 1536x1024 \
  --image-quality high
```

## Useful Commands

Check what SmartRecipe extracts from a page:

```bash
smart-recipe retrieve "https://example.com/recipe"
```

Check your current Monsieur Cuisine session:

```bash
smart-recipe me
```

List recent draft recipes:

```bash
smart-recipe drafts
```

Print the generated recipe as JSON:

```bash
smart-recipe import-url "https://example.com/recipe" --dry-run --full-response --json
```

## Common Options

- `--dry-run`: generate the recipe without uploading it
- `--full-response`: print the extracted page summary, generated recipe and upload response
- `--json`: print machine-readable JSON
- `--log-level debug`: show more detailed progress logs
- `--model <model>`: choose the OpenAI recipe model
- `--reasoning <effort>`: choose OpenAI reasoning effort (`minimal`, `low`, `medium`, `high`)
- `--prompt-cookie`: ask for a browser cookie if no saved session is available

## Notes And Limits

SmartRecipe uses the Monsieur Cuisine website APIs through your logged-in session. This is not an official Lidl or Monsieur Cuisine tool, so it may need updates if their website changes.

Recipe pages vary a lot. Always review generated drafts for quantities, allergies, food safety and whether the steps make sense for your device.

Image recreation can help avoid reusing a website image, but it is still your responsibility to make sure the final recipe and image are appropriate for how you use them.

## For Developers

Technical notes about package modules, extension points and Smart mode mapping live in [docs/technical.md](docs/technical.md).
