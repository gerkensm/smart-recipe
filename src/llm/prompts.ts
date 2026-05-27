import { categoryPromptText } from "../catalogs/catalogs.js";
import type { SupportedLocale } from "../catalogs/types.js";
import { SMART_MODE_GUIDE } from "../recipes/constants.js";
import type { RecipeInput } from "../recipes/schema.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import type { PromptModeType } from "../recipes/types.js";
import { getLocalePromptGuidance } from "./locale-guidance.js";

export function buildRecipeInstructions(
  locale: SupportedLocale = "de-DE",
  excludeModes: PromptModeType[] = [],
): string {
  const localeGuidance = getLocalePromptGuidance(locale);

  return [
    "Convert recipe page content into the provided Monsieur Cuisine Smart recipe input JSON.",
    buildCapabilityLine(excludeModes),
    excludeModes.length > 0
      ? `IMPORTANT: The following modes are NOT available because the user does not own the required accessories. Do NOT use them under any circumstances: ${excludeModes.join(", ")}.`
      : "",
    "You may adjust the order of steps or simplify steps so they can be performed with the machine if this does not materially change the final dish. Transform the recipe into a Monsieur-Cuisine-native recipe with as few manual steps as practical.",
    "Avoid workflows that require the user to repeatedly empty the pot unless the source recipe truly requires it. For each step, supply a title.",
    "WORKFLOW LOGIC: While you should avoid unnecessarily emptying the pot, you MUST empty and clean it if a subsequent step physically requires a cold, clean, or dry jug (e.g., whipping egg whites, whipping cream, or grinding dry spices after a wet cooking step). Do not combine hot and cold steps improperly.",
    "STRICT CAPACITY LIMIT: The jug holds a maximum of 3 liters (approx. 3000 g). You MUST mentally calculate the cumulative weight and volume of all ingredients currently in the jug at every step. If the total exceeds 3000 g/ml at any point, you MUST scale down the entire recipe proportionally from the very beginning to ensure safe cooking without overflowing.",
    "APPLY CULINARY LOGIC: Do not force machine actions that ruin the dish's texture. For example, avoid continuous stirring for dishes that traditionally require undisturbed resting or crust formation (like Paella). Adapt the workflow to make logical sense for a food processor.",
    "DOUGH LIMIT: While the jug holds 3 liters, the motor cannot knead 3 kg of solid dough. For heavy doughs (bread, pizza) using 'solidDoughKnead', the absolute maximum limit is 1000 g of flour (approx. 1600 g total dough weight). If the source recipe exceeds this, you MUST scale it down.",
    `Use ${localeGuidance.outputLanguage} for every user-facing recipe field and set settings.locale to ${localeGuidance.locale}. Translate where necessary.`,
    `Convert units to ${localeGuidance.unitConvention}`,
    "IMPORTANT: Convert liquid measurements (ml, l) to weight in grams (g) for ingredients wherever it makes sense (for example, 1 ml water-like liquid = 1 g). Use separate scale steps for each ingredient unless this would make the recipe worse. Update the corresponding steps to reflect weighing the liquids.",
    "In the text instructions of steps requiring the user to add ingredients to the pot (which must be in the description of a manual step or a scale step), specify the quantity of the ingredient to add so the user does not have to consult the ingredients list again.",
    "Use automatic modes only when the source implies a cooker action. Otherwise use mode type none.",
    "Do not reproduce the recipe text. Paraphrase heavily and use the source as inspiration, but produce clearly new content for all text fields. Do not imply or mention that this is based on an existing recipe, e.g. by saying this has been adapted for the Monsieur Cuisine, especially in the recipe description. Do not say that the amount was adjusted to fit the Monsieur Cuisine pot or the like. Just describe the recipe as if it were an original recipe.",
    "If the source contains multiple recipes belonging to the same dish or meal, convert all components or courses and optimize their order for easy cooking and short preparation time.",
    "Make an educated guess on nutrients if the source does not provide them. Nutrient amounts must be whole integers.",
    "Be specific, concise and clear. Avoid vague or ambiguous statements. Make the recipe foolproof without stating the absolutely obvious or sounding condescending.",
    "STEP DESCRIPTION AND TITLE LIMITS: Step descriptions are ONLY allowed/supplied for manual 'none' steps, scale steps, and turbo steps. For these steps, keep descriptions at or below 240 characters. For all other automatic modes (roast, steam, manualCooking, solidDoughKnead, softDoughKnead, liquidDoughKnead, sousVide, slowCooking, cookingEggs, precleaning, fermentation, riceCooking, foodProcessor, puree, smoothie), the description MUST be empty (i.e. \"\") or omitted. Put the action summary in the title (which must be at or below 80 characters).",
    "SPLIT INSTRUCTION AND COOKING STEPS: Because step descriptions are not displayed on the device screen for automatic cooking modes (except scale and turbo), any step that requires cooking or motor processing (such as manualCooking, roast, steam, dough kneading, slowCooking, sousVide, etc.) must be split into two steps:\n" +
      "1. A manual preparation/instruction step (mode: 'none') immediately preceding the cooking step, with a detailed description explaining what to add, prepare, or insert (e.g., 'Add 150 g chopped onions, 20 g olive oil, and close the lid.').\n" +
      "2. The actual cooking/processing step (with the corresponding automatic mode and empty description), where the title simply describes the action (e.g., 'Sauté onions' or 'Steam vegetables').\n" +
      "This ensures all human instructions, ingredient additions, and warnings are visible on the device screen before the machine program begins.",
    "MULTI-LEVEL STEAMING OPTIMIZATION: If the source recipe has multiple elements cooked by steaming or boiling, cook them simultaneously using up to three levels to optimize preparation time: Level 1 in the jug (directly or in the simmering basket); Level 2 in the deep steamer attachment; and Level 3 in the flat steamer insert. Design the recipe steps to cook these concurrently rather than sequentially.",
    `STEAMING PREHEAT CHOICE: For every steaming step (mode type 'steam'), you MUST instruct the user in the preceding manual step's description whether to preheat the pot based on starting liquid temperature. Append the exact localized phrase to the preceding manual step's description: if starting liquid is cold/room-temperature, append "${localeGuidance.accessoryPhrases.preheatSteamingCold}"; if liquid is already hot/boiling, append "${localeGuidance.accessoryPhrases.preheatSteamingHot}". The entire preceding step description must still be at or below 240 characters.`,
    `SCRAPE DOWN RULE: For any high-speed chopping step (speed 4 or above, or using turbo), the step description (of turbo steps or of the manual step preceding manualCooking) MUST instruct the user to scrape down the sides of the jug using the spatula by appending the exact phrase: "${localeGuidance.accessoryPhrases.spatulaScrape}". The entire description must still be at or below 240 characters.`,
    `GROSS VS. NET WEIGHT RULE: When an ingredient requires preparation that reduces its weight (e.g., peeling, coring, trimming, or removing outer leaves/stems/bones):
1. Ingredients list: Must specify the 'buying weight' (gross weight) as purchased (e.g., '1000 g potatoes').
2. Scale settings / steps: Must use the 'net weight' (the actual weight of the prepared ingredient put in the jug, e.g., 900 g).
3. Scale step description: Must instruct the user to prepare the ingredient and specify the net weight to weigh. Format this exact instruction using the localized template: "${localeGuidance.accessoryPhrases.grossNetWeightTemplate}" by substituting {ingredient} with the name of the ingredient and {net} with the net weight. Ensure the entire step description (including this instruction) is at or below 240 characters.`,
    `HOT PUREEING SAFETY WARNING: When pureeing hot contents (temperature > 60 °C, or using automatic 'puree' or 'smoothie' mode, or manualCooking speed >= 4 on hot ingredients), you MUST instruct the user to wait about 10 seconds after mixing stops before opening the lid. This warning must be appended to the description of the manual step preceding the pureeing/mixing step, using the exact localized phrase: "${localeGuidance.accessoryPhrases.hotPureeingSafety}". The entire step description must be at or below 240 characters.`,
    `PRE-CUTTING INGREDIENTS: For any step chopping, pureeing, or using turbo on solid foods (speed >= 4, 'puree', 'smoothie', 'turbo', or 'foodProcessor' mode), you MUST instruct the user to pre-cut ingredients into pieces of approximately 3-4 cm. For turbo steps, include this in the turbo step description; for other modes, include this in the description of the manual step preceding the chopping/processing step. Append/include the exact localized phrase: "${localeGuidance.accessoryPhrases.preCutIngredients}". The entire step description must be at or below 240 characters.`,
    `SIMMERING BASKET LIQUID LIMIT: Boiling or steaming using the simmering basket requires at least 500 ml of water or liquid. You MUST instruct the user to add at least 500 ml of liquid in the manual step preceding the boiling/steaming step, using the exact localized phrase: "${localeGuidance.accessoryPhrases.minLiquidSimmeringBasket}". The entire step description must be at or below 240 characters.`,
    "WEIGHING STATE CONSTRAINT: The scale function ('scale' mode) only operates when the machine is completely idle (at rest). Therefore, scale steps (mode type 'scale') can never contain active cooking, stirring, or kneading phases. You MUST split such tasks: weigh the ingredients first in a 'scale' step, then perform cooking/stirring/kneading in a subsequent step.",
    "CHOP-SCRAPE-SAUTÉ SEQUENCE: When a recipe calls for sautéing aromatics (onions, garlic, carrots), break it into distinct steps: 1. Add them whole or halved (scale step); 2. Chop them (manualCooking step); 3. Scrape down the sides (manual step, mode none); 4. Add oil/butter (scale step); 5. Run the 'roast' (Anbraten) mode step.",
    `LID DRIP EMULSION TRICK: For emulsions (like mayonnaise or hollandaise), do not instruct the user to add the oil directly to the jug. Instead, instruct them in the description of the manual step preceding the mixing step to leave the measuring cup inserted and pour the oil slowly onto the lid by appending/including the exact localized phrase: "${localeGuidance.accessoryPhrases.emulsionOilDrip}". The entire step description must be at or below 240 characters.`,
    "TEMPERATURE CEILINGS FOR SENSITIVE INGREDIENTS: Keep temperatures strictly at safe limits for the following ingredients:\n" +
      "- Yeast: Never heat fresh or dry yeast above 37 °C or it will die.\n" +
      "- Eggs: Never add egg yolks to thicken a sauce if the mixture is hotter than 80 °C (insert a cooling step/delay if necessary).\n" +
      "- Dairy: Reduce cooking temperature to 95 °C when adding heavy amounts of milk or cream to prevent boiling over.",
    "DELAYED ADDITION OF THICKENERS: When thickening soups or sauces with cornstarch, flour, or melting cheese, add these ingredients only in the final 2-3 minutes of the cooking process, and ensure the temperature does not exceed 100 °C.",
    `FAT-FREE WHIPPING: If a recipe requires whipping egg whites using the butterfly whisk, explicitly state in the description of the manual step preceding the whipping step that the jug and whisk must be clean, dry, and fat-free by appending the exact localized phrase: "${localeGuidance.accessoryPhrases.cleanDryFatFree}". The entire step description must be at or below 240 characters.`,
    "WORKFLOW SEQUENCING (DRY-FIRST): Always schedule dry grinding or milling steps (e.g. making powdered sugar, grating hard cheese, grinding nuts or whole spices) as the very first step of the recipe when the jug is completely dry. Instruct the user to decant and set aside the ground ingredient.",
    `MINCING SMALL AROMATICS: When mincing small quantities of light ingredients (garlic cloves, fresh herbs, citrus peel), instruct the user in the description of the manual step preceding the mincing step to turn on the machine to speed 8 first, and then drop the ingredients through the hole in the lid onto the running blades using the exact localized phrase: "${localeGuidance.accessoryPhrases.dropOntoRunningBlades}". The entire step description must be at or below 240 characters.`,
    "FLAVOR DEVELOPMENT: For curries, stews, or heavily spiced dishes, dry spices and tomato paste must be added during the final 1-2 minutes of the 'roast' (Anbraten) step with oil/fat to bloom their flavors, before any water, broth, or tomatoes are added.",
    "LIQUID ADJUSTMENT: Because the device is a sealed environment with low evaporation, reduce the amount of added water, broth, or stock by about 10-20% compared to standard stovetop recipes to prevent watery results.",
    `MOISTURE REDUCTION: For steps involving reducing a liquid, thickening a sauce, or boiling jam, instruct the user in the description of the manual step preceding the cooking/reduction step to remove the measuring cup using the phrase: "${localeGuidance.accessoryPhrases.removeMeasuringCup}" and place the simmering basket on the lid as a splash guard using the phrase: "${localeGuidance.accessoryPhrases.useBasketAsSplashGuard}". The entire step description must be at or below 240 characters.`,
    `STEAMER SETUP: Whenever transitioning to a step that uses the external steamer attachment (Dampfgaraufsatz), explicitly instruct the user in the description of the manual step preceding the steaming step to remove the standard mixing bowl lid entirely and lock the deep steamer attachment directly onto the mixing bowl using the phrase: "${localeGuidance.accessoryPhrases.steamerSetup}". The entire step description must be at or below 240 characters.`,
    `RAPID COOL-DOWN: If a step requires the contents of the jug to cool down (e.g., waiting for the temperature to drop below 80 °C before adding eggs, or 37 °C for yeast), instruct the user in the description of the manual step preceding the cooling/delay step to remove the mixing bowl from the base and remove the measuring cup using the phrase: "${localeGuidance.accessoryPhrases.removeMeasuringCup}". The entire step description must be at or below 240 characters.`,
    `CONTINUOUS FEEDING: For steps requiring the gradual addition of ingredients while the machine is running (adding flour to dough, dropping ice, etc.), instruct the user in the description of the manual step preceding the mixing step to remove the measuring cup using the phrase: "${localeGuidance.accessoryPhrases.removeMeasuringCup}" and drop ingredients through the opening in the lid. The entire step description must be at or below 240 characters.`,
    `PARALLEL PREP SEQUENCING: The device UI only displays one step at a time, so the user cannot read ahead while the machine is running. If a recipe contains a long, unattended cooking step (e.g., > 3 minutes) followed by manual prep for later ingredients (like peeling, dicing, or washing), you MUST schedule the manual prep as a separate "Look-ahead Prep Step" (mode type: "none") immediately before the cooking step. The description of this prep step must instruct the user to proceed using the exact localized template: "${localeGuidance.accessoryPhrases.lookAheadPrepTemplate}". Substitute {task} in the template with the specific manual tasks in the target language (e.g., "peel and dice the potatoes"). The entire step description must be at or below 240 characters.`,
    "GLOBAL TIMELINE OPTIMIZATION: Do not simply translate the source recipe linearly. Before generating steps, analyze the entire recipe to identify long, unattended machine operations (e.g., simmering, steaming, or boiling for more than 3 minutes). You MUST heavily restructure the recipe order so that all manual preparation tasks (peeling, chopping, washing, weighing future ingredients) are delayed and scheduled as 'Look-ahead Prep Steps' (mode: none) immediately preceding these long machine operations. The goal is zero idle time for the machine and zero idle time for the human.\n" +
      "Contrast Examples:\n" +
      "- Standard Linear Flow (Bad): 1. Peel potatoes. 2. Chop carrots. 3. Sauté onions (3 min). 4. Boil everything (20 min).\n" +
      "- Optimized JIT Flow (Good): 1. Sauté onions (3 min). 2. Look-ahead Prep: 'Use the cooking time in the following step to peel the potatoes and chop the carrots.' 3. Boil everything (20 min).",
    "",
    "Accessory and hardware rules:",
    accessoryHardwareRules(locale),
    "",
    `Category IDs and ${localeGuidance.categoryLabel}:`,
    categoryPromptText(locale),
    "",
    "Smart mode constraints:",
    schemaHintsForModes(excludeModes),
  ]
    .filter(Boolean)
    .join("\n");
}

const ALL_CAPABILITIES =
  "weighing, manual cooking, roasting, steaming, Smart dough modes, sous-vide, slow cooking, egg cooking, precleaning, fermentation, rice cooking, food processor, puree, smoothie and turbo";

const MODE_CAPABILITY_LABELS: Partial<Record<PromptModeType, string>> = {
  foodProcessor: "food processor",
  scale: "weighing",
  turbo: "turbo",
  puree: "puree",
  smoothie: "smoothie",
  steam: "steaming",
  sousVide: "sous-vide",
  slowCooking: "slow cooking",
  cookingEggs: "egg cooking",
  fermentation: "fermentation",
  riceCooking: "rice cooking",
  roast: "roasting",
  solidDoughKnead: "Smart dough modes",
  softDoughKnead: "Smart dough modes",
  liquidDoughKnead: "Smart dough modes",
  manualCooking: "manual cooking",
};

function buildCapabilityLine(excludeModes: PromptModeType[]): string {
  if (excludeModes.length === 0) {
    return `Target only Monsieur Cuisine Smart (MC3.0). Make use of the Smart's capabilities as much as possible: ${ALL_CAPABILITIES}. Try to make the recipe as automatic as possible while keeping it realistic.`;
  }
  const excludedLabels = new Set(
    excludeModes.flatMap((m) =>
      MODE_CAPABILITY_LABELS[m] ? [MODE_CAPABILITY_LABELS[m]!] : [],
    ),
  );
  const remaining = ALL_CAPABILITIES.split(", ")
    .filter((cap) => !excludedLabels.has(cap))
    .join(", ");
  return `Target only Monsieur Cuisine Smart (MC3.0). Make use of the Smart's capabilities as much as possible: ${remaining}. Try to make the recipe as automatic as possible while keeping it realistic.`;
}

export function accessoryHardwareRules(
  locale: SupportedLocale = "de-DE",
): string {
  const { accessoryTerms: terms, accessoryPhrases: phrases } =
    getLocalePromptGuidance(locale);
  return [
    `- ${terms.blade}: Always inserted by default. CRITICAL RULE: You MUST explicitly use ${terms.reverse} (rotationDirection left) with speed 1-3 for ANY cooking step where solid ingredients (like meat chunks, sausages, pasta, delicate vegetables, or cooked grains) are in the jug and must remain intact. Forward rotation will shred them into mush. For chopping, pureeing, or turbo on solid foods, instruct the user to pre-cut ingredients into 3-4 cm pieces: "${phrases.preCutIngredients}".`,
    `- ${terms.butterflyWhisk}: Use for whipping cream (minimum 200 g), egg whites (minimum 4 eggs), or emulsifying delicate mixtures. The step must explicitly say "${phrases.insertButterflyWhisk}" before use. Maximum speed is 4. Never use ${terms.turbo}. Never use the ${terms.spatula} while it is inserted. If whipping egg whites, instruct the user that the jug and whisk must be clean, dry, and fat-free: "${phrases.cleanDryFatFree}".`,
    `- ${terms.simmeringBasket}: Use for boiling sides (like potatoes, rice, pasta) inside the jug. PHYSICAL LIMIT: The basket is much smaller than the jug. It can hold a maximum of approx. 1000 g to 1200 g of solid food. If the recipe requires more, it must be scaled down. The step must explicitly instruct the user to lift/remove the basket using the spatula's hook: "${phrases.liftSimmeringBasket}". For roasting, searing, or high-temperature reduction steps, instruct the user to remove the ${terms.measuringCup} and place the simmering basket on top of the lid as a splash guard: "${phrases.useBasketAsSplashGuard}" to allow steam to escape while preventing splattering. Boiling or steaming using the simmering basket requires at least 500 ml/g of liquid in the mixing bowl; explicitly instruct the user to add it: "${phrases.minLiquidSimmeringBasket}".`,
    `- ${terms.steamerAttachment}: Use for steaming on top of the jug. The step must explicitly say "${phrases.attachSteamerAttachment}". CRITICAL RULE: Steaming requires at least 500 g of thin, freely boiling liquid (like water or clear broth). NEVER schedule a steaming step when the jug contains thick mixtures, stews, or grains that have absorbed most of the liquid (like risotto or thick rice dishes). Thick mixtures trap heat, produce zero steam for the attachment, and will violently burn at the bottom of the jug. STEAMER SETUP: Whenever transitioning to a step that uses the external steamer attachment, explicitly instruct the user to remove the standard mixing bowl lid entirely and lock the deep steamer attachment directly onto the mixing bowl: "${phrases.steamerSetup}".`,
    `- ${terms.steamerInsert}: Use for steaming delicate foods (like meatballs, fish, or soft vegetables) as a third level placed inside the ${terms.steamerAttachment}.`,
    `- ${terms.measuringCup}: Mention when it should be kept inserted to reduce splashing, or removed for evaporation during reduction/roasting/thickening steps (where the ${terms.simmeringBasket} should be used instead as a splash guard: "${phrases.useBasketAsSplashGuard}"). Instruct the user to remove the measuring cup ("${phrases.removeMeasuringCup}") for rapid cool-down, continuous feeding of ingredients, or when pouring oil slowly onto the lid for emulsions: "${phrases.emulsionOilDrip}". (Note: for steaming steps, the standard mixing bowl lid is removed entirely, so removing the measuring cup is not required as it comes off with the lid).`,
    `- ${terms.turbo}: Maximum 2.5 l liquid in the jug. Never use ${terms.turbo} when the current contents are hotter than 60 C. For hot pureeing (> 60 C) or using automatic 'puree' or 'smoothie' modes on hot ingredients, always instruct the user to wait about 10 seconds after mixing stops before opening the lid: "${phrases.hotPureeingSafety}".`,
  ].join("\n");
}

export function schemaHintsForModes(
  excludeModes: PromptModeType[] = [],
): string {
  const excluded = new Set(excludeModes);
  return [
    !excluded.has("manualCooking") &&
      `manualCooking: temperature steps ${SMART_MODE_GUIDE.manualCooking.temperature.steps.join(", ")} C; time 1-5940 s; speed 0-10, but max 3 when temperature > 0; rotationDirection left/right. Use speed 0 if the dish requires simmering without being stirred to pieces.`,
    !excluded.has("turbo") &&
      "turbo: 1-20 s. Do not use when contents are hotter than 60 C, with more than 2.5 l liquid, or while the butterfly whisk is inserted.",
    !excluded.has("scale") && "scale: 5-5000 g.",
    !excluded.has("roast") &&
      `roast: temperature steps ${SMART_MODE_GUIDE.roast.temperature.steps.join(", ")} C; time 0-840 s.`,
    (!excluded.has("solidDoughKnead") || !excluded.has("softDoughKnead")) &&
      "solidDoughKnead and softDoughKnead: 45-240 s.",
    !excluded.has("liquidDoughKnead") && "liquidDoughKnead: 45-360 s.",
    !excluded.has("steam") && "steam: 0-3600 s.",
    !excluded.has("sousVide") && "sousVide: 40-85 C; 15-720 min.",
    !excluded.has("slowCooking") &&
      `slowCooking: temperature steps ${SMART_MODE_GUIDE.slowCooking.temperature.steps.join(", ")} C; 15-480 min.`,
    !excluded.has("cookingEggs") &&
      "cookingEggs: size small/medium/large; texture soft/waxy_soft/hard. Use waxy_soft for medium/soft-boiled.",
    !excluded.has("precleaning") && "precleaning: duration short or long.",
    !excluded.has("fermentation") &&
      `fermentation: temperature steps ${SMART_MODE_GUIDE.fermentation.temperature.steps.join(", ")} C; 30-720 min.`,
    !excluded.has("riceCooking") && "riceCooking: 1200-2400 s.",
    !excluded.has("foodProcessor") && "foodProcessor: 1-300 s.",
    (!excluded.has("puree") || !excluded.has("smoothie")) &&
      "puree and smoothie: 30-120 s.",
    "Use mode type none for plain human-only instructions.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRecipeImagePrompt(
  page: RetrievedRecipePage,
  recipe: RecipeInput,
): string {
  return [
    "Create a new, original image for this recipe.",
    "",
    "Visual direction:",
    "- Realistic finished dish that clearly reflects the recipe, but cooked with a Monsieur Cuisine Smart cooker - so do not show the recipe in traditional cookware, but served on a plate, as nice as possible, but realistically made with a smart one-pot cooking device. Do not show it in the smart cooker, do not make the smart cooker a part of the image - just show the dish on a plat, serving plate, or the like.",
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
    JSON.stringify(
      {
        servingSize: recipe.servingSize.amount,
        servingUnit: recipe.servingSize.unit,
        preparationTime: recipe.servingSize.preparationTime,
        readyInTime: recipe.servingSize.readyInTime,
        ingredientGroups: recipe.servingSize.ingredientGroups,
        steps: recipe.servingSize.steps,
      },
      null,
      2,
    ),
    "",
    "Source recipe Markdown:",
    page.markdown.slice(0, 12000),
  ]
    .filter(Boolean)
    .join("\n");
}
