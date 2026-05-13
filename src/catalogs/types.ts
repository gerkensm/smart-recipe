export type SupportedLocale = "cs-CZ" | "pl-PL" | "de-DE" | "fr-FR" | "en-US" | "it-IT";

export type LocaleLanguage = "cs" | "pl" | "de" | "fr" | "en" | "it";

export type PlannedLocale =
  | "cs-CZ"
  | "pl-PL"
  | "de-DE"
  | "fr-FR"
  | "en-US"
  | "it-IT"
  | "es-ES"
  | "nl-NL"
  | "pt-PT"
  | "hu-HU"
  | "el-GR"
  | "sk-SK"
  | "tr-TR"
  | "ro-RO"
  | "fi-FI"
  | "hr-HR"
  | "bg-BG"
  | "sv-SE";

export type CategoryKey =
  | "saucesAndDips"
  | "soupsAndStews"
  | "salads"
  | "sideDishes"
  | "snacks"
  | "mainDishes"
  | "babyFood"
  | "drinks"
  | "onePotAllInOne"
  | "desserts"
  | "baking"
  | "breakfast"
  | "dinner"
  | "starters"
  | "jamAndJelly"
  | "germanCuisine"
  | "frenchCuisine"
  | "italianCuisine"
  | "polishCuisine"
  | "spanishCuisine"
  | "foodProcessor"
  | "vegan"
  | "vegetarian";

export type Complexity = "easy" | "medium" | "hard";

export interface CategoryDefinition {
  key: CategoryKey;
  id: number;
  label: string;
  description: string;
  order: number;
}

export interface LocaleCatalog {
  locale: SupportedLocale;
  language: LocaleLanguage;
  verified: true;
  categories: Record<CategoryKey, CategoryDefinition>;
  complexityIds: Record<Complexity, number>;
  defaultIngredientGroupName: string;
}
