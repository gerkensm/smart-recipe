import { categoryPromptText } from "../catalogs/catalogs.js";
import type { SupportedLocale } from "../catalogs/types.js";
import { SMART_MODE_GUIDE } from "../recipes/constants.js";
import type { RecipeInput } from "../recipes/schema.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import { getLocalePromptGuidance } from "./locale-guidance.js";

export function buildRecipeInstructions(locale: SupportedLocale = "de-DE"): string {
  const localeGuidance = getLocalePromptGuidance(locale);

  return [
    "Convert recipe page content into the provided Monsieur Cuisine Smart recipe input JSON.",
    "Target only Monsieur Cuisine Smart (MC3.0). Make use of the Smart's capabilities as much as possible: weighing, manual cooking, roasting, steaming, Smart dough modes, sous-vide, slow cooking, egg cooking, precleaning, fermentation, rice cooking, food processor, puree, smoothie and turbo. Try to make the recipe as automatic as possible while keeping it realistic.",
    "You may adjust the order of steps or simplify steps so they can be performed with the machine if this does not materially change the final dish. Transform the recipe into a Monsieur-Cuisine-native recipe with as few manual steps as practical.",
    "Avoid workflows that require the user to repeatedly empty the pot unless the source recipe truly requires it. For each step, supply a title.",
    "Respect the size of the pot (3 liters); adjust the recipe size if the original recipe would otherwise overflow the pot.",
    `Use ${localeGuidance.outputLanguage} for every user-facing recipe field and set locale to ${localeGuidance.locale}. Translate where necessary.`,
    `Convert units to ${localeGuidance.unitConvention}`,
    "IMPORTANT: Convert liquid measurements (ml, l) to weight in grams (g) for ingredients wherever it makes sense (for example, 1 ml water-like liquid = 1 g). Use separate scale steps for each ingredient unless this would make the recipe worse. Update the corresponding steps to reflect weighing the liquids.",
    "In the descriptions of steps requiring the user to add ingredients to the pot, specify the quantity of the ingredient to add so the user does not have to consult the ingredients list again.",
    "Use automatic modes only when the source implies a cooker action. Otherwise use mode type none.",
    "Do not reproduce the recipe text. Paraphrase heavily and use the source as inspiration, but produce clearly new content for all text fields. Do not imply or mention that this is based on an existing recipe, e.g. by saying this has been adapted for the Monsieur Cuisine, especially in the recipe description. Do not say that the amount was adjusted to fit the Monsieur Cuisine pot or the like. Just describe the recipe as if it were an original recipe.",
    "If the source contains multiple recipes belonging to the same dish or meal, convert all components or courses and optimize their order for easy cooking and short preparation time.",
    "Make an educated guess on nutrients if the source does not provide them. Nutrient amounts must be whole integers.",
    "Be specific, concise and clear. Avoid vague or ambiguous statements. Make the recipe foolproof without stating the absolutely obvious or sounding condescending.",
    "Keep each step description at or below 240 characters. The overall recipe description may be more verbose and give context.",
    "",
    "Accessory and hardware rules:",
    accessoryHardwareRules(locale),
    "",
    `Category keys and ${localeGuidance.categoryLabel}:`,
    categoryPromptText(locale),
    "",
    "Smart mode constraints:",
    schemaHintsForModes()
  ].join("\n");
}

export function accessoryHardwareRules(locale: SupportedLocale = "de-DE"): string {
  const { accessoryTerms: terms, accessoryPhrases: phrases } = getLocalePromptGuidance(locale);
  return [
    `- ${terms.blade}: Always inserted by default. Use ${terms.reverse} with speed 1-3 for gentle stirring when ingredients should not be chopped.`,
    `- ${terms.butterflyWhisk}: Use for whipping cream (minimum 200 g), egg whites (minimum 4 eggs), or emulsifying delicate mixtures. The step must explicitly say "${phrases.insertButterflyWhisk}" before use. Maximum speed is 4. Never use ${terms.turbo}. Never use the ${terms.spatula} while it is inserted.`,
    `- ${terms.simmeringBasket}: Use for boiling sides such as rice, potatoes, or eggs inside the jug. The step must explicitly say "${phrases.insertSimmeringBasket}". Requires at least 500 g water or other liquid in the jug.`,
    `- ${terms.steamerAttachment}: Use for steaming on top of the jug. The step must explicitly say "${phrases.attachSteamerAttachment}". Ensure enough liquid is in the jug for the steaming time.`,
    `- ${terms.measuringCup}: Mention when it should be removed for evaporation or kept inserted to reduce splashing.`,
    `- ${terms.turbo}: Maximum 2.5 l liquid in the jug. Never use ${terms.turbo} when the current contents are hotter than 60 C.`
  ].join("\n");
}

export function schemaHintsForModes(): string {
  return [
    `manualCooking: temperature steps ${SMART_MODE_GUIDE.manualCooking.temperature.steps.join(", ")} C; time 1-5940 s; speed 0-10, but max 3 when temperature > 0; rotationDirection left/right.`,
    "turbo: 1-20 s. Do not use when contents are hotter than 60 C, with more than 2.5 l liquid, or while the butterfly whisk is inserted.",
    "scale: 5-5000 g.",
    `roast: temperature steps ${SMART_MODE_GUIDE.roast.temperature.steps.join(", ")} C; time 0-840 s.`,
    "solidDoughKnead and softDoughKnead: 45-240 s.",
    "liquidDoughKnead: 45-360 s.",
    "steam: 0-3600 s.",
    "sousVide: 40-85 C; 15-720 min.",
    `slowCooking: temperature steps ${SMART_MODE_GUIDE.slowCooking.temperature.steps.join(", ")} C; 15-480 min.`,
    "cookingEggs: size small/medium/large; texture soft/waxy_soft/hard. Use waxy_soft for medium/soft-boiled.",
    "precleaning: duration short or long.",
    `fermentation: temperature steps ${SMART_MODE_GUIDE.fermentation.temperature.steps.join(", ")} C; 30-720 min.`,
    "riceCooking: 1200-2400 s.",
    "foodProcessor: 1-300 s.",
    "puree and smoothie: 30-120 s.",
    "Use mode type none for plain human-only instructions."
  ].join("\n");
}

export function buildRecipeImagePrompt(page: RetrievedRecipePage, recipe: RecipeInput): string {
  return [
    "Create a new, original image for this recipe.",
    "",
    "Visual direction:",
    "- Realistic finished dish that clearly reflects the recipe.",
    "- Looks like an ambitious home cook took the photo with a good cellphone camera.",
    "- Expressive, appetizing, warm and natural, but not professional food photography.",
    "- Imperfect home setting is welcome: real plate or bowl, natural kitchen light, modest styling.",
    "- Avoid studio lighting, commercial plating, glossy magazine styling, text, logos, watermarks, people, hands, packaging, or branded objects.",
    "- If reference images are provided, use them only as loose context for the dish; do not copy their composition, styling, props, or distinctive presentation.",
    "",
    `Recipe title: ${recipe.title || page.title}`,
    recipe.description ? `Description: ${recipe.description}` : undefined,
    "",
    "Structured recipe:",
    JSON.stringify({
      servingSize: recipe.servingSize.amount,
      servingUnit: recipe.servingSize.unit,
      preparationTime: recipe.servingSize.preparationTime,
      readyInTime: recipe.servingSize.readyInTime,
      ingredientGroups: recipe.servingSize.ingredientGroups,
      steps: recipe.servingSize.steps
    }, null, 2),
    "",
    "Source recipe Markdown:",
    page.markdown.slice(0, 12000)
  ].filter(Boolean).join("\n");
}
