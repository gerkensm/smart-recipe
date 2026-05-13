import type { SupportedLocale } from "../catalogs/types.js";

const createRecipeUrls: Record<string, string> = {
  "cs-CZ": "https://www.monsieur-cuisine.com/cs/vytvorit-recept?devices=mc-smart",
  "pl-PL": "https://www.monsieur-cuisine.com/pl/create-recipe?devices=mc-smart",
  "de-DE": "https://www.monsieur-cuisine.com/de/create-recipe?devices=mc-smart",
  "fr-FR": "https://www.monsieur-cuisine.com/fr/creer-une-recette?devices=mc-smart",
  "en-US": "https://www.monsieur-cuisine.com/en/create-recipe?devices=mc-smart",
  "it-IT": "https://www.monsieur-cuisine.com/it/create-recipe?devices=mc-smart"
};

export function createRecipeUrl(locale: SupportedLocale = "de-DE"): string {
  const url = createRecipeUrls[locale];
  if (!url) {
    throw new Error(`No verified create-recipe URL for locale ${locale}.`);
  }
  return url;
}
