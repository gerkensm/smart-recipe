import { getLocalePromptGuidance } from "../../llm/locale-guidance.js";
import type { SupportedLocale } from "../../catalogs/types.js";

export function buildCookidooRecipeInstructions(
  locale: SupportedLocale = "de-DE",
  options: {
    excludeModes?: string[];
    version?: "TM5" | "TM6" | "TM7";
    tmVersion?: "tm5" | "tm6" | "tm7";
  } = {}
): string {
  const localeGuidance = getLocalePromptGuidance(locale);
  const rawVersion = options.version ?? options.tmVersion ?? process.env.TM_VERSION ?? "TM6";
  const version = (rawVersion.toUpperCase() === "TM5" ? "TM5" : rawVersion.toUpperCase() === "TM7" ? "TM7" : "TM6") as "TM5" | "TM6" | "TM7";
  const excludeModes = options.excludeModes ?? [];

  const instructions = [
    "Convert recipe page content into the provided Thermomix Cookidoo recipe input JSON.",
    "",
    `Target: Thermomix (${version}).`,
    version === "TM5"
      ? "IMPORTANT: Target device is TM5. TM5 does NOT support 'browning' or 'sousVide' modes. Do NOT generate browning or sousVide annotations under any circumstances."
      : version === "TM7"
      ? "Target device is TM7, which supports all guided modes including browning, steaming, cook, dough, blend, turbo, warmUp, and riceCooker (inheriting all TM6 modes)."
      : "Target device is TM6, which supports all guided modes including browning, steaming, cook, dough, blend, turbo, warmUp, and riceCooker.",
    "",
    excludeModes.length > 0
      ? `IMPORTANT: The following modes are excluded by user preference: ${excludeModes.join(", ")}. Do NOT use them.`
      : "",
    "",
    "You may adjust the order of steps or simplify steps so they can be performed with the machine if this does not materially change the final dish. Transform the recipe into a Thermomix-native recipe with as few manual steps as practical.",
    "",
    "STRICT CAPACITY LIMIT: The mixing bowl holds a maximum of 2.2 liters (approx. 2200 g). You MUST mentally calculate the cumulative weight and volume of all ingredients currently in the bowl at every step. If the total exceeds 2200 g/ml at any point, you MUST scale down the entire recipe proportionally from the very beginning to ensure safe cooking without overflowing.",
    "",
    "DOUGH LIMIT: The motor cannot knead heavy doughs above 800 g of flour (approx. 1300 g total dough weight). If the source recipe exceeds this, you MUST scale it down.",
    "",
    `Use ${localeGuidance.outputLanguage} for every user-facing recipe field and set settings.locale to ${localeGuidance.locale}. Translate where necessary.`,
    `Convert units to ${localeGuidance.unitConvention}`,
    "",
    "STEP FORMAT — TEXT & ANNOTATIONS:",
    "Each step is a structured object containing:",
    "  - text: The full natural text of the step instructions (with proper spaces, complete sentences).",
    "  - ingredientAnnotations: (optional) array of objects linking substrings to ingredients:",
    "    - matchedSubstring: the exact substring from the step text that names the ingredient.",
    "    - ingredientId: the string identifier of the ingredient (e.g. 'koriander', 'zwiebel').",
    "  - modeAnnotations: (optional) array of objects linking substrings to guided mode settings:",
    "    - matchedSubstring: the exact substring from the step text that represents the guided mode settings.",
    "    - mode: the guided mode object (see below).",
    "",
    "IMPORTANT:",
    "- The step text must be written naturally with spaces. Do NOT omit spaces or concatenate words.",
    "- For ingredientAnnotations, specify every occurrence of an ingredient in the step text.",
    "- For modeAnnotations, specify the exact phrase describing the guided mode (e.g. \"10 Sek./Stufe 7 zerkleinern\", \"Dank Linkslauf 15 Min./Stufe 1 garen\"). Only annotate the guided mode once per operation (do NOT duplicate mode annotations).",
    "",
    "GUIDED MODE RULES & CONSTRAINTS (based on exact Cookidoo editor values):",
    "1. COOK: Standard simmering/cooking. Temperature 37–120°C (any integer), time in seconds, speed soft/1–5, optional direction CW/CCW. Excluded by default for My Creations — only use if --extend-tm-modes is set.",
    "2. STEAMING: Varoma cooking. NO temperature field. Time 1–5940s (max 99 min). Speed: soft, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5. Direction: CW or CCW. Accessory: 'Varoma', 'Gareinsatz', or 'both'.",
    "3. BROWNING: TM6/TM7 only. Time 1–1800s (max 30 min). Temperature MUST be one of [140, 145, 150, 155, 160]. Power: 'Gentle' (Leicht) or 'Intensive' (Intensiv).",
    "4. DOUGH: Time 1–1200s (max 20 min). No speed or temperature.",
    "5. BLEND (Pürieren): HIGH-SPEED ONLY. Speed MUST be one of [6, 6.5, 7, 7.5, 8]. Time 10–300s (min 10s, max 5 min). Do NOT use for speed 1–5 operations — leave those as plain text runs.",
    "6. TURBO: Short maximum-speed pulses. Use 'pulseDuration' (must be exactly 0.5, 1, or 2) and optional 'pulseCount' (1–9).",
    "7. WARM UP (Erwärmen): Temperature must be one of [37, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90] °C. Speed: soft, 1, or 2. No time field.",
    "8. RICE COOKER: No parameters.",
    "",
    "EXAMPLES (ingredients list for these examples: [\"25 g frischer Koriander\", \"2 Knoblauchzehen\", \"1 Zwiebel, halbiert\", \"15 g Ingwer, frisch\", \"20 g Pflanzenöl\", \"1 EL Currypulver\", \"½ TL Chiliflocken\", \"150 g rote Linsen\", \"400 g stückige Tomaten\", \"400 g Kokosmilch\", \"600 g Wasser\"]):",
    JSON.stringify([
      {
        text: "Koriander in den Mixtopf geben, 10 Sek./Stufe 7 zerkleinern und umfüllen.",
        ingredientAnnotations: [
          { matchedSubstring: "Koriander", ingredientId: "koriander" }
        ],
        modeAnnotations: [
          { matchedSubstring: "10 Sek./Stufe 7 zerkleinern", mode: { type: "blend", time: 10, speed: "7" } }
        ]
      },
      {
        text: "Zwiebel, Knoblauch und Ingwer in den Mixtopf geben und 5 Sek./Stufe 5 zerkleinern. Mit dem Spatel nach unten schieben.",
        ingredientAnnotations: [
          { matchedSubstring: "Zwiebel", ingredientId: "zwiebel" },
          { matchedSubstring: "Knoblauch", ingredientId: "knoblauch" },
          { matchedSubstring: "Ingwer", ingredientId: "ingwer" }
        ]
      },
      {
        text: "Pflanzenöl, Currypulver und Chiliflocken zugeben und 4 Min./140°C anbraten.",
        ingredientAnnotations: [
          { matchedSubstring: "Pflanzenöl", ingredientId: "pflanzenoel" },
          { matchedSubstring: "Currypulver", ingredientId: "currypulver" },
          { matchedSubstring: "Chiliflocken", ingredientId: "chiliflocken" }
        ],
        modeAnnotations: [
          { matchedSubstring: "4 Min./140°C anbraten", mode: { type: "browning", time: 240, temperature: 140 } }
        ]
      },
      {
        text: "Stückige Tomaten, Kokosmilch, Wasser, Salz und Pfeffer zugeben. Gareinsatz auf den Deckel stellen.",
        ingredientAnnotations: [
          { matchedSubstring: "Stückige Tomaten", ingredientId: "tomaten" },
          { matchedSubstring: "Kokosmilch", ingredientId: "kokosmilch" },
          { matchedSubstring: "Wasser", ingredientId: "wasser" }
        ]
      }
    ], null, 2),
    "",
    "GENERAL STYLE & CONVENTIONS:",
    "- Paraphrase description and steps to avoid reproducing copyrighted source text. Describe the recipe as if it were original.",
    "- Make an educated guess on nutrients (calories, carbohydrate, fat, protein) if missing from source. Amount must be whole integers.",
    "- Be specific, concise, and clear. Make the recipe foolproof.",
    "- hints: Extract any useful tips, variations, or serving suggestions from the source recipe into the hints field. Omit tips that are irrelevant to Thermomix (e.g. stovetop-only alternatives). Use an empty string if there are no useful tips."
  ];

  return instructions.filter(Boolean).join("\n");
}
