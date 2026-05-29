import type { RetrievedRecipePage } from "../retriever/types.js";

export function cookidooCreatedRecipeToPage(recipe: any, sourceUrl = ""): RetrievedRecipePage {
  const content = recipe.recipeContent ?? {};
  const title = content.name ?? recipe.title ?? "Cookidoo Recipe";
  const ingredients = (content.ingredients ?? content.recipeIngredient ?? []).map((ingredient: any) =>
    typeof ingredient === "string" ? ingredient : ingredient.text ?? ""
  ).filter(Boolean);
  const steps = (content.instructions ?? content.recipeInstructions ?? []).map((step: any) =>
    typeof step === "string" ? { text: step } : step
  );
  const hints = formatHints(content.hints);
  const markdown = [
    `# ${title}`,
    "",
    "Source: Cookidoo created recipe",
    content.yield?.value ? `Servings: ${content.yield.value} ${content.yield.unitText ?? "portion"}` : undefined,
    content.prepTime ? `Prep time: ${Math.round(content.prepTime / 60)} min` : undefined,
    content.totalTime ? `Total time: ${Math.round(content.totalTime / 60)} min` : undefined,
    content.tools?.length ? `Thermomix versions: ${content.tools.join(", ")}` : undefined,
    "",
    "## Ingredients",
    ...ingredients.map((ingredient: string) => `- ${ingredient}`),
    "",
    "## Source Machine Steps",
    ...steps.flatMap((step: any, index: number) => [
      `${index + 1}. ${step.text ?? ""}`,
      ...formatSourceAnnotations(step.annotations).map((line) => `   ${line}`)
    ]),
    hints ? ["", "## Notes", hints].join("\n") : undefined,
  ].filter(Boolean).join("\n");

  return {
    url: sourceUrl || recipe.recipeId || "",
    finalUrl: sourceUrl || recipe.recipeId || "",
    title,
    markdown,
    html: "",
    images: imageCandidatesFromCookidooContent(content),
  };
}

export function cookidooOfficialRecipeToPage(recipe: any, sourceUrl = ""): RetrievedRecipePage {
  const title = recipe.title ?? recipe.name ?? "Cookidoo Recipe";
  const ingredients = recipe.recipeIngredientGroups?.flatMap((group: any) =>
    (group.recipeIngredients ?? []).map((ingredient: any) =>
      [ingredient.quantity?.value, ingredient.unitNotation, ingredient.ingredientNotation, ingredient.preparation]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+,/g, ",")
    )
  ) ?? recipe.recipeIngredient ?? [];
  const steps = recipe.recipeStepGroups?.flatMap((group: any) => group.recipeSteps ?? []) ?? recipe.recipeInstructions ?? [];
  const notes = (recipe.additionalInformation ?? []).map((item: any) => cleanText(item.content ?? "")).filter(Boolean);

  const markdown = [
    `# ${title}`,
    "",
    "Source: Cookidoo official recipe",
    recipe.servingSize?.quantity?.value ? `Servings: ${recipe.servingSize.quantity.value} ${recipe.servingSize.unitNotation ?? "portion"}` : undefined,
    recipe.thermomixVersions?.length ? `Thermomix versions: ${recipe.thermomixVersions.join(", ")}` : undefined,
    recipe.optionalDevices?.length ? `Optional devices: ${recipe.optionalDevices.join(", ")}` : undefined,
    "",
    "## Ingredients",
    ...ingredients.map((ingredient: string) => `- ${cleanText(ingredient)}`),
    "",
    "## Source Machine Steps",
    ...steps.map((step: any, index: number) => `${index + 1}. ${cleanText(typeof step === "string" ? step : step.formattedText ?? step.text ?? "")}`),
    notes.length ? ["", "## Notes", ...notes.map((note: string) => `- ${note}`)].join("\n") : undefined,
  ].filter(Boolean).join("\n");

  return {
    url: sourceUrl || recipe.id || "",
    finalUrl: sourceUrl || recipe.id || "",
    title,
    markdown,
    html: "",
    images: imageCandidatesFromCookidooContent(recipe),
  };
}

export function monsieurCuisineRecipeToPage(recipe: any, sourceUrl = ""): RetrievedRecipePage {
  const sourceRecipe = recipe?.data?.recipe ?? recipe;
  const title = sourceRecipe.title ?? sourceRecipe.name ?? "Monsieur Cuisine Recipe";
  const serving = sourceRecipe.servingSizes?.[0] ?? sourceRecipe.servingSize ?? {};
  const ingredientGroups = serving.ingredientGroups ?? [];
  const steps = serving.steps ?? [];

  const markdown = [
    `# ${title}`,
    "",
    "Source: Monsieur Cuisine recipe",
    serving.amount ? `Servings: ${serving.amount} ${serving.unit ?? "portion"}` : undefined,
    serving.preparationTime ? `Prep time: ${serving.preparationTime} min` : undefined,
    serving.readyInTime ? `Total time: ${serving.readyInTime} min` : undefined,
    "",
    "## Ingredients",
    ...ingredientGroups.flatMap((group: any) => [
      group.name ? `### ${group.name}` : undefined,
      ...(group.ingredients ?? []).map((ingredient: any) =>
        `- ${[ingredient.amount, ingredient.unit, ingredient.name].filter(Boolean).join(" ")}${ingredient.isOptional ? " (optional)" : ""}`
      )
    ].filter(Boolean)),
    "",
    "## Source Machine Steps",
    ...steps.flatMap((step: any, index: number) => [
      `${index + 1}. ${[step.title, step.description ?? step.text].filter(Boolean).join(" - ")}`,
      step.mode ? `   Source mode: ${formatMonsieurCuisineMode(step.mode)}` : undefined
    ].filter(Boolean)),
  ].filter(Boolean).join("\n");

  return {
    url: sourceUrl || String(sourceRecipe.id ?? ""),
    finalUrl: sourceUrl || String(sourceRecipe.id ?? ""),
    title,
    markdown,
    html: "",
    images: [],
  };
}

function formatSourceAnnotations(annotations: any[] | undefined): string[] {
  if (!Array.isArray(annotations)) return [];
  return annotations
    .filter((annotation) => annotation.type === "MODE" || annotation.type === "TTS")
    .map((annotation) => {
      if (annotation.type === "MODE") {
        return `Source mode: ${annotation.name}${annotation.data ? ` ${JSON.stringify(annotation.data)}` : ""}`;
      }
      return `Source settings: ${JSON.stringify(annotation.data ?? {})}`;
    });
}

function formatMonsieurCuisineMode(mode: any): string {
  const settings = mode.deviceSettings?.[0];
  return [mode.type, settings ? JSON.stringify(settings) : undefined].filter(Boolean).join(" ");
}

function imageCandidatesFromCookidooContent(content: any): RetrievedRecipePage["images"] {
  const urls = collectCookidooImageUrls(content).map(normalizeCookidooImageUrl);
  return [...new Set(urls)].map((url) => ({
    url,
    contentType: "image/jpeg",
    score: 80,
    reason: "Cookidoo recipe image",
  }));
}

function collectCookidooImageUrls(content: any): string[] {
  const urls: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    if (!value.trim()) return;
    urls.push(value);
  };
  const addAsset = (asset: any) => {
    if (!asset || typeof asset !== "object") return;
    add(asset.square);
    add(asset.portrait);
    add(asset.landscape);
    if (asset.images && typeof asset.images === "object") {
      addAsset(asset.images);
    }
  };

  add(content?.image);
  add(content?.squareImage);
  add(content?.squareRetinaImage);
  add(content?.landscapeImage);
  add(content?.portraitImage);
  addAsset(content?.assets?.images);
  addAsset(content?.assets);

  for (const asset of content?.descriptiveAssets ?? []) {
    addAsset(asset);
  }

  return urls;
}

function normalizeCookidooImageUrl(url: string): string {
  return url.replace("/{transformation}", "");
}

function formatHints(hints: unknown): string {
  if (typeof hints === "string") return hints;
  if (!Array.isArray(hints)) return "";
  return hints.map((hint) => typeof hint === "string" ? hint : cleanText((hint as any)?.content ?? (hint as any)?.text ?? "")).filter(Boolean).join("\n");
}

function cleanText(value: string): string {
  return String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
