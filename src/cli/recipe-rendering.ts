import type { CookidooRecipeInput } from "../devices/tm/schema.js";
import { getDeviceAdapter } from "../devices/index.js";
import {
  mapOfficialCookidooToInput,
  mapCustomCookidooToInput,
} from "./cookidoo-mappers.js";
import { mapMonsieurCuisineToInput } from "./monsieur-cuisine-mappers.js";

export function mapRecipeToInput(device: "mc" | "tm", recipe: any): any {
  if (device === "tm") {
    return recipe && recipe["@type"] === "Recipe"
      ? mapOfficialCookidooToInput(recipe)
      : mapCustomCookidooToInput(recipe);
  }
  return mapMonsieurCuisineToInput(recipe);
}

export function formatRecipeForTerminal(device: "mc" | "tm", recipe: any): string {
  const adapter = getDeviceAdapter(device);

  if (device === "tm") {
    let input: CookidooRecipeInput;
    const looksLikeOfficialCookidooRecipe =
      Boolean(recipe && (
        recipe["@type"] === "Recipe" ||
        recipe.recipeIngredientGroups ||
        recipe.recipeStepGroups ||
        recipe.servingSize
      ));
    if (looksLikeOfficialCookidooRecipe) {
      input = mapOfficialCookidooToInput(recipe);
    } else {
      input = mapCustomCookidooToInput(recipe);
    }
    return adapter.formatInputForTerminal(input);
  }

  const input = mapMonsieurCuisineToInput(recipe?.data?.recipe ?? recipe);
  return adapter.formatInputForTerminal(input);
}
