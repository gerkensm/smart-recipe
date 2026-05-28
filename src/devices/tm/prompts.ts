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
    "MODE ANNOTATIONS GUIDELINES:",
    "- To make a step interactive on the Thermomix screen, add a modeAnnotation containing `matchedSubstring` and its parameters.",
    "- CRITICAL: `matchedSubstring` MUST exist in the step `text` EXACTLY, character-for-character, including case and punctuation. If the substring is not found, the annotation will fail to attach.",
    "- Do NOT annotate basic stirring, mixing, or manual heat steps. Manual mode highlights are crossed out and unclickable in the TM7/Cookidoo UI. Leave basic stirring/cooking instructions as plain text without annotations so users can easily set values manually on the machine.",
    "- Only use concrete, supported guided modes: cook, steaming, browning, dough, blend, turbo, warmUp, riceCooker.",
    "- IMPORTANT: Steps at speed 1–5 with a time duration (e.g. '5 Sek./Stufe 5 zerkleinern') have NO matching mode in My Creations — leave them as plain text without any modeAnnotation.",
    "",
    "GUIDED MODE RULES & CONSTRAINTS (based on exact Cookidoo editor values):",
    "1. COOK: Standard simmering/cooking. Temperature 37–120°C (any integer), time in seconds, speed soft/1–5, optional direction CW/CCW. Excluded by default for My Creations — only use if --extended-modes is set.",
    "2. STEAMING: Varoma cooking. NO temperature field. Time 1–5940s (max 99 min). Speed: soft, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5. Direction: CW or CCW. Accessory: 'Varoma', 'Gareinsatz', or 'both'.",
    "3. BROWNING: TM6/TM7 only. Time 1–1800s (max 30 min). Temperature MUST be one of [140, 145, 150, 155, 160]. Power: 'Gentle' (Leicht) or 'Intensive' (Intensiv).",
    "4. DOUGH: Time 1–1200s (max 20 min). No speed or temperature.",
    "5. BLEND (P\u00fcrieren): HIGH-SPEED ONLY. Speed MUST be one of [6, 6.5, 7, 7.5, 8]. Time 10–300s (min 10s, max 5 min). Do NOT use for speed 1–5 operations.",
    "6. TURBO: Short maximum-speed pulses. Use 'pulseDuration' (must be exactly 0.5, 1, or 2) and optional 'pulseCount' (1–9). Example: '3 Sek. Turbo' → pulseDuration=1, pulseCount=3.",
    "7. WARM UP (Erw\u00e4rmen): Temperature must be one of [37, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90] °C. Speed: soft, 1, or 2. No time field.",
    "8. RICE COOKER: No parameters.",
    "",
    "EXAMPLES OF NATURAL STEPS WITH CORRECT ANNOTATIONS:",
    JSON.stringify([
      {
        text: "Stückige Tomaten, 600 g Wasser, 350 g Kokosmilch, Salz und Pfeffer zugeben. Mit dem Spatel einmal über den Mixtopfboden fahren, damit nichts ansetzt. Gareinsatz statt Messbecher auf den Deckel stellen und 25 Min./100°C/Linkslauf/Stufe 1 garen.",
        modeAnnotations: [
          {
            matchedSubstring: "25 Min./100°C/Linkslauf/Stufe 1 garen",
            mode: {
              type: "cook",
              time: 1500,
              temperature: 100,
              speed: "1",
              direction: "CCW"
            }
          }
        ]
      },
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
      },
      {
        text: "Zwiebel, Knoblauch und Ingwer in den Mixtopf geben und 5 Sek./Stufe 5 zerkleinern. Mit dem Spatel nach unten schieben.",
        modeAnnotations: [] // speed 1–5 with time → no annotation for My Creations; leave as plain text
      },
      {
        text: "Koriander in den Mixtopf geben, 10 Sek./Stufe 7 zerkleinern und umfüllen.",
        modeAnnotations: [
          {
            matchedSubstring: "10 Sek./Stufe 7 zerkleinern",
            mode: {
              type: "blend",
              time: 10,
              speed: "7"
            }
          }
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
