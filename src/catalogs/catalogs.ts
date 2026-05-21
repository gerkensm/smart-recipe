import type { CategoryDefinition, CategoryKey, Complexity, LocaleCatalog, LocaleLanguage, PlannedLocale, SupportedLocale } from "./types.js";
import { getLocaleText } from "../locales/locales.js";

export const plannedLocales: readonly PlannedLocale[] = [
  "cs-CZ",
  "pl-PL",
  "de-DE",
  "fr-FR",
  "en-US",
  "it-IT",
  "es-ES",
  "nl-NL",
  "pt-PT",
  "hu-HU",
  "el-GR",
  "sk-SK",
  "tr-TR",
  "ro-RO",
  "fi-FI",
  "hr-HR",
  "bg-BG",
  "sv-SE"
];

export const supportedLocales: readonly SupportedLocale[] = ["cs-CZ", "pl-PL", "de-DE", "fr-FR", "en-US", "it-IT"];

export const categoryMeta: Record<CategoryKey, { id: number; order: number; description: string }> = {
  saucesAndDips: { id: 220, order: 1, description: "Sauces, dressings, dips, pestos and spreads." },
  soupsAndStews: { id: 228, order: 2, description: "Soups, broths, stews and other warm one-bowl dishes." },
  salads: { id: 236, order: 3, description: "Cold or warm salads." },
  sideDishes: { id: 244, order: 4, description: "Side dishes served alongside a main course." },
  snacks: { id: 252, order: 5, description: "Small bites, finger food and informal snacks." },
  mainDishes: { id: 260, order: 6, description: "Main courses and substantial savory dishes." },
  babyFood: { id: 268, order: 7, description: "Baby food and child-focused purees." },
  drinks: { id: 276, order: 8, description: "Drinks, smoothies and beverages." },
  onePotAllInOne: { id: 284, order: 9, description: "Complete dishes prepared mostly in one vessel." },
  desserts: { id: 308, order: 11, description: "Sweet desserts, puddings and creams." },
  baking: { id: 316, order: 12, description: "Cakes, breads, pastry and dough-based baking." },
  breakfast: { id: 324, order: 13, description: "Breakfast and brunch dishes." },
  dinner: { id: 332, order: 14, description: "Dinner or evening meals." },
  starters: { id: 340, order: 15, description: "Starters and appetizers." },
  jamAndJelly: { id: 348, order: 16, description: "Jams, marmalades, compotes and jellies." },
  germanCuisine: { id: 471, order: 18, description: "German cuisine." },
  frenchCuisine: { id: 472, order: 19, description: "French cuisine." },
  italianCuisine: { id: 473, order: 20, description: "Italian cuisine." },
  polishCuisine: { id: 498, order: 21, description: "Polish cuisine." },
  spanishCuisine: { id: 499, order: 22, description: "Spanish cuisine." },
  foodProcessor: { id: 554, order: 0, description: "Recipes that strongly use the food processor/cutter function." },
  vegan: { id: 579, order: 0, description: "Vegan recipes." },
  vegetarian: { id: 588, order: 0, description: "Vegetarian recipes." }
};

export const categoryKeys = Object.keys(categoryMeta) as CategoryKey[];

const localeLanguage: Record<SupportedLocale, LocaleLanguage> = {
  "cs-CZ": "cs",
  "pl-PL": "pl",
  "de-DE": "de",
  "fr-FR": "fr",
  "en-US": "en",
  "it-IT": "it"
};

export const localeComplexityIds: Record<SupportedLocale, Record<Complexity, number>> = {
  "cs-CZ": { easy: 537, medium: 536, hard: 538 },
  "pl-PL": { easy: 159, medium: 102, hard: 106 },
  "de-DE": { easy: 142, medium: 99, hard: 104 },
  "fr-FR": { easy: 108, medium: 98, hard: 103 },
  "en-US": { easy: 22, medium: 16, hard: 20 },
  "it-IT": { easy: 109, medium: 100, hard: 105 }
};

function buildCategories(locale: SupportedLocale): Record<CategoryKey, CategoryDefinition> {
  const localeText = getLocaleText(locale);
  return Object.fromEntries(
    categoryKeys.map((key) => [
      key,
      {
        key,
        id: categoryMeta[key].id,
        label: localeText.categoryLabels[key],
        description: categoryMeta[key].description,
        order: categoryMeta[key].order
      }
    ])
  ) as Record<CategoryKey, CategoryDefinition>;
}

function buildCatalog(locale: SupportedLocale): LocaleCatalog {
  const localeText = getLocaleText(locale);
  return {
    locale,
    language: localeLanguage[locale],
    verified: true,
    complexityIds: localeComplexityIds[locale],
    defaultIngredientGroupName: localeText.defaultIngredientGroupName,
    categories: buildCategories(locale)
  };
}

export const catalogs: Record<SupportedLocale, LocaleCatalog> = {
  "cs-CZ": buildCatalog("cs-CZ"),
  "pl-PL": buildCatalog("pl-PL"),
  "de-DE": buildCatalog("de-DE"),
  "fr-FR": buildCatalog("fr-FR"),
  "en-US": buildCatalog("en-US"),
  "it-IT": buildCatalog("it-IT")
};

export function getCatalog(locale: string = "de-DE"): LocaleCatalog {
  const catalog = catalogs[locale as SupportedLocale];
  if (!catalog) {
    throw new Error(`No verified Monsieur Cuisine catalog is bundled for ${locale}. Supported locales: ${supportedLocales.join(", ")}.`);
  }
  return catalog;
}

export function categoryPromptText(locale = "de-DE"): string {
  const catalog = getCatalog(locale);
  return Object.values(catalog.categories)
    .sort((a, b) => a.order - b.order || a.id - b.id)
    .map((category) => `- ${category.id}: ${category.label} (${category.key}) - ${category.description}`)
    .join("\n");
}
