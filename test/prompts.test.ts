import { describe, expect, it } from "vitest";
import { OpenAIRecipeGenerator } from "../src/llm/openai-generator.js";
import { accessoryHardwareRules, buildRecipeImagePrompt, buildRecipeInstructions } from "../src/llm/prompts.js";
import type { RecipeInput } from "../src/recipes/schema.js";
import type { RetrievedRecipePage } from "../src/retriever/types.js";

describe("LLM prompt guidance", () => {
  it("uses the requested locale instead of hardcoded prose", () => {
    const prompt = buildRecipeInstructions("de-DE");

    expect(prompt).toContain("set settings.locale to de-DE");
    expect(prompt).toContain("German as used in Germany");
    expect(prompt).toContain("Category IDs and German site IDs");
    expect(prompt).toContain("MULTI-LEVEL STEAMING OPTIMIZATION");
    expect(prompt).toContain("STEAMING PREHEAT CHOICE");
    expect(prompt).toContain("SCRAPE DOWN RULE");
    expect(prompt).toContain("GROSS VS. NET WEIGHT RULE");
    expect(prompt).toContain("bei der Abfrage zu Aufheizen 'Ja' wählen");
    expect(prompt).toContain("bei der Abfrage zu Aufheizen 'Nein' wählen");
    expect(prompt).toContain("mit dem Spatel nach unten schieben");
    expect(prompt).toContain("{ingredient} schälen/putzen (ergibt ca. {net} g)");
    expect(prompt).toContain("Nach dem Mixen heißer Zutaten ca. 10 Sekunden warten");
    expect(prompt).toContain("in ca. 3–4 cm große Stücke schneiden");
    expect(prompt).toContain("mindestens 500 ml Flüssigkeit in den Mixbehälter geben");
    expect(prompt).toContain("Öl langsam auf den Deckel gießen");
    expect(prompt).toContain("Mixbehälter und Rühraufsatz müssen absolut sauber, trocken und fettfrei sein");
    expect(prompt).toContain("durch die Deckelöffnung auf die laufenden Messer fallen lassen");
    expect(prompt).toContain("den Messbecher entfernen");
    expect(prompt).toContain("WEIGHING STATE CONSTRAINT");
    expect(prompt).toContain("CHOP-SCRAPE-SAUTÉ SEQUENCE");
    expect(prompt).toContain("TEMPERATURE CEILINGS FOR SENSITIVE INGREDIENTS");
    expect(prompt).toContain("MOISTURE REDUCTION");
    expect(prompt).toContain("STEAMER SETUP");
    expect(prompt).toContain("den Deckel des Mixbehälters abnehmen und den Dampfgaraufsatz direkt auf den Mixbehälter aufsetzen");
    expect(prompt).toContain("RAPID COOL-DOWN");
    expect(prompt).toContain("CONTINUOUS FEEDING");
    expect(prompt).toContain("PARALLEL PREP SEQUENCING");
    expect(prompt).toContain("GLOBAL TIMELINE OPTIMIZATION");
    expect(prompt).toContain("Die Kochzeit im folgenden Schritt nutzen, um {task}.");
  });

  it("supports the English locale guidance", () => {
    const prompt = buildRecipeInstructions("en-US");

    expect(prompt).toContain("set settings.locale to en-US");
    expect(prompt).toContain("English");
    expect(prompt).toContain("Category IDs and English site IDs");
    expect(prompt).toContain("select 'Yes' when asked to preheat");
    expect(prompt).toContain("select 'No' when asked to preheat");
    expect(prompt).toContain("scrape down the sides of the bowl using the spatula");
    expect(prompt).toContain("GROSS VS. NET WEIGHT RULE");
    expect(prompt).toContain("Peel/trim {ingredient} (yields approx. {net} g)");
    expect(prompt).toContain("After pureeing hot contents, wait about 10 seconds");
    expect(prompt).toContain("cut into pieces of approx. 3-4 cm");
    expect(prompt).toContain("add at least 500 ml of liquid to the mixing bowl");
    expect(prompt).toContain("slowly pour the oil onto the lid so it trickles past the measuring cup");
    expect(prompt).toContain("The mixing bowl and butterfly whisk must be absolutely clean, dry, and fat-free");
    expect(prompt).toContain("drop through the lid opening onto the running blades");
    expect(prompt).toContain("remove the measuring cup");
    expect(prompt).toContain("STEAMER SETUP");
    expect(prompt).toContain("remove the mixing bowl lid and lock the steamer attachment directly onto the mixing bowl");
    expect(prompt).toContain("PARALLEL PREP SEQUENCING");
    expect(prompt).toContain("GLOBAL TIMELINE OPTIMIZATION");
    expect(prompt).toContain("Use the cooking time in the following step to {task}.");
  });

  it("passes the requested locale into OpenAI generation", async () => {
    let request: any;
    const client = {
      responses: {
        create: async (body: any) => {
          request = body;
          return {
            output_text: JSON.stringify({
              title: "Tomato Soup",
              description: "A bright soup.",
              settings: { locale: "en-US", complexityId: 22 },
              categoryIds: [],
              nutrients: [],
              servingSize: {
                amount: 4,
                unit: "servings",
                instruction: "",
                preparationTime: 10,
                readyInTime: 35,
                ingredientGroups: [{ name: "Soup", ingredients: [{ name: "tomatoes", amount: 800, unit: "g", isOptional: false }] }],
                steps: [{ title: "Serve", description: "Serve warm.", mode: { type: "none" } }]
              }
            })
          };
        }
      }
    };
    const generator = new OpenAIRecipeGenerator({ client: client as any, locale: "en-US" });

    await generator.generate(pageFixture, { locale: "en-US" });

    expect(request.instructions).toContain("set settings.locale to en-US");
    expect(request.input[0].content[0].text).toContain("Preferred locale: en-US");
  });

  it("includes accessory and hardware rules with de-DE device terms", () => {
    const rules = accessoryHardwareRules("de-DE");

    expect(rules).toContain("Messereinsatz");
    expect(rules).toContain("Linkslauf");
    expect(rules).toContain("Rühraufsatz einsetzen");
    expect(rules).toContain("Kocheinsatz");
    expect(rules).toContain("Dampfgaraufsatz aufsetzen");
    expect(rules).toContain("flacher Dampfgaraufsatz");
    expect(rules).toContain("den Kocheinsatz mithilfe des Spatels herausnehmen");
    expect(rules).toContain("den Kocheinsatz als Spritzschutz auf den Deckel setzen");
    expect(rules).toContain("hotter than 60 C");
    expect(rules).toContain("den Messbecher entfernen");
    expect(rules).toContain("den Deckel des Mixbehälters abnehmen und den Dampfgaraufsatz direkt auf den Mixbehälter aufsetzen");
    expect(rules).toContain("Nach dem Mixen heißer Zutaten ca. 10 Sekunden warten");
    expect(rules).toContain("in ca. 3–4 cm große Stücke schneiden");
    expect(rules).toContain("mindestens 500 ml");
  });

  it("builds recipe image prompts from recipe and page context", () => {
    const prompt = buildRecipeImagePrompt(pageFixture, recipeFixture);

    expect(prompt).toContain("ambitious home cook");
    expect(prompt).toContain("not professional food photography");
    expect(prompt).toContain("Tomato Soup");
    expect(prompt).toContain("tomatoes");
    expect(prompt).toContain("Source recipe Markdown");
  });
});

const recipeFixture = {
  title: "Tomato Soup",
  description: "A bright soup with roasted tomatoes.",
  settings: {
    locale: "en-US",
    complexityId: 22
  },
  categoryIds: [],
  nutrients: [
    { name: "calories", unit: "kCal", amount: 180 },
    { name: "carbohydrate", unit: "g", amount: 20 },
    { name: "fat", unit: "g", amount: 8 },
    { name: "protein", unit: "g", amount: 4 }
  ],
  servingSize: {
    amount: 4,
    unit: "servings",
    instruction: "",
    preparationTime: 10,
    readyInTime: 35,
    ingredientGroups: [
      {
        name: "Soup",
        ingredients: [
          { name: "tomatoes", amount: 800, unit: "g", isOptional: false }
        ]
      }
    ],
    steps: [
      {
        title: "Cook",
        description: "Cook and blend until smooth.",
        mode: { type: "none" as const }
      }
    ]
  }
} as RecipeInput;

const pageFixture: RetrievedRecipePage = {
  url: "https://example.test/soup",
  finalUrl: "https://example.test/soup",
  title: "Tomato Soup",
  markdown: "# Tomato Soup\n\nRoast tomatoes, then simmer and blend.",
  html: "",
  images: []
};
