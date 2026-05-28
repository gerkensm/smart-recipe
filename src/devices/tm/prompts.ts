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
      ? "Target device is TM7, which supports all guided modes including browning, steaming, dough, blend, turbo, warmUp, and riceCooker (inheriting all TM6 modes)."
      : "Target device is TM6, which supports all guided modes including browning, steaming, dough, blend, turbo, warmUp, and riceCooker.",
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
    "MODE ANNOTATIONS GUIDELINES:",
    "- To make a step interactive on the Thermomix screen, add a modeAnnotation containing `matchedSubstring` and its parameters.",
    "- CRITICAL: `matchedSubstring` MUST exist in the step `text` EXACTLY, character-for-character, including case and punctuation. If the substring is not found, the annotation will fail to attach.",
    "- Do NOT annotate basic stirring, mixing, or manual heat steps. Manual mode highlights are crossed out and unclickable in the TM7/Cookidoo UI. Leave basic stirring/cooking instructions as plain text without annotations so users can easily set values manually on the machine.",
    "- Only use concrete, supported guided modes: steaming, browning, dough, blend, turbo, warmUp, riceCooker.",
    "",
    "GUIDED MODE RULES & CONSTRAINTS:",
    "1. STEAMING: Use the 'steaming' mode for Varoma cooking. Crucially, steaming mode has NO temperature value field (Varoma temperature is automatic). Speed can be soft, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5. Direction can be CW or CCW.",
    "2. BROWNING: Only available on TM6 and TM7. Time must be in seconds. Temperature MUST be strictly one of [140, 145, 150, 155, 160] (in Celsius). Power can be 'Gentle'.",
    "3. DOUGH: For kneading dough. Only requires 'time' in seconds. No speed or temperature parameters are allowed.",
    "4. BLEND: Speed must be strictly one of ['6', '6.5', '7', '7.5', '8']. Time is in seconds.",
    "5. TURBO: For short high-speed chopping (1 to 2 seconds). Pulse count can be specified.",
    "6. WARM UP: Target warming temperature (37 to 100 °C) and speed (soft, 1, 2).",
    "7. RICE COOKER: No args required.",
    "",
    "EXAMPLES OF NATURAL STEPS WITH CORRECT ANNOTATIONS:",
    JSON.stringify([
      {
        text: "Wlej do naczynia 500 g wody, nałóż przystawkę Varoma i gotuj na parze 20 min/Varoma/obr. 1.",
        modeAnnotations: [
          {
            matchedSubstring: "gotuj na parze 20 min/Varoma/obr. 1",
            mode: {
              type: "steaming",
              time: 1200,
              speed: "1"
            }
          }
        ]
      },
      {
        text: "Dodaj 150 g mięsa i praż przez 5 min/160°C.",
        modeAnnotations: [
          {
            matchedSubstring: "praż przez 5 min/160°C",
            mode: {
              type: "browning",
              time: 300,
              temperature: 160
            }
          }
        ]
      }
    ], null, 2),
    "",
    "GENERAL STYLE & CONVENTIONS:",
    "- Paraphrase description and steps to avoid reproducing copyrighted source text. Describe the recipe as if it were original.",
    "- Make an educated guess on nutrients (calories, carbohydrate, fat, protein) if missing from source. Amount must be whole integers.",
    "- Be specific, concise, and clear. Make the recipe foolproof."
  ];

  return instructions.filter(Boolean).join("\n");
}
