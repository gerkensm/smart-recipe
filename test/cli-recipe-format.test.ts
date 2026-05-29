import { describe, expect, it } from "vitest";
import {
  cleanHtmlText,
  parseIsoDuration,
  mapOfficialCookidooToInput,
  mapCustomCookidooToInput,
  mapMonsieurCuisineToInput,
  formatRecipeForTerminal,
  formatUserForTerminal,
  formatDraftsForTerminal
} from "../src/cli/main.js";

// Helper to strip ANSI escape codes for testing the plain text structure
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("CLI Recipe Formatting & Adapters Mapping", () => {
  describe("cleanHtmlText", () => {
    it("handles empty input", () => {
      expect(cleanHtmlText("")).toBe("");
    });

    it("strips HTML tags and resolves common entities", () => {
      expect(cleanHtmlText("<nobr>30 Sek./Stufe 10</nobr>")).toBe("30 Sek./Stufe 10");
      expect(cleanHtmlText("1 &frac12; TL Salz")).toBe("1 ½ TL Salz");
      expect(cleanHtmlText("1 &frac14; Hefe")).toBe("1 ¼ Hefe");
      expect(cleanHtmlText("3 &frac34; Wasser")).toBe("3 ¾ Wasser");
      expect(cleanHtmlText("Salz &amp; Pfeffer")).toBe("Salz & Pfeffer");
      expect(cleanHtmlText("Apple &quot;Pie&quot;")).toBe("Apple \"Pie\"");
      expect(cleanHtmlText("O&#39;clock")).toBe("O'clock");
    });
  });

  describe("parseIsoDuration", () => {
    it("handles empty or invalid inputs", () => {
      expect(parseIsoDuration("")).toBe(0);
      expect(parseIsoDuration("PT")).toBe(0);
    });

    it("parses ISO 8601 durations to minutes correctly", () => {
      expect(parseIsoDuration("PT10M")).toBe(10);
      expect(parseIsoDuration("PT1H30M")).toBe(90);
      expect(parseIsoDuration("PT45S")).toBe(1);
      expect(parseIsoDuration("PT2H")).toBe(120);
    });
  });

  describe("mapOfficialCookidooToInput", () => {
    it("maps official JSON-LD recipe and builds ingredient/mode annotations", () => {
      const officialPayload = {
        "@type": "Recipe",
        name: "Vollwert-Brötchen",
        prepTime: "PT10M",
        totalTime: "PT40M",
        recipeYield: "12 Stück",
        recipeIngredient: [
          "100 g Weizenkörner",
          "400 g Weizenmehl",
          "1 ½ TL Salz",
          "220 g Wasser",
          "40 g Öl",
          "1 Würfel Hefe",
          "1 Prise Zucker"
        ],
        recipeInstructions: [
          "Backofen auf 200°C vorheizen.",
          "Getreidekörner in den Mixtopf geben und 30 Sek./Stufe 10 mahlen.",
          "Weizenmehl, Salz, Wasser, Öl, Hefe und Zucker zugeben und Teig /2 Min. kneten."
        ]
      };

      const mapped = mapOfficialCookidooToInput(officialPayload);

      expect(mapped.title).toBe("Vollwert-Brötchen");
      expect(mapped.prepTime).toBe(10);
      expect(mapped.totalTime).toBe(40);
      expect(mapped.servingSize).toBe(12);
      expect(mapped.servingUnitText).toBe("Stück");

      // Ingredients
      expect(mapped.ingredients.length).toBe(7);
      expect(mapped.ingredients[0]).toEqual({ id: "ing-0", text: "100 g Weizenkörner" });

      // Step 1: No annotations
      expect(mapped.steps[0].ingredientAnnotations).toEqual([]);
      expect(mapped.steps[0].modeAnnotations).toEqual([]);

      // Step 2: "30 Sek./Stufe 10" blend mode and "Getreidekörner" ingredient (from ing-0 "Weizenkörner")
      // Wait, let's verify if "Getreidekörner" is matched. Let's see: Weizenkörner split -> Weizenkörner (not Getreidekörner),
      // so it wouldn't match. But "Weizenmehl", "Salz", "Wasser", "Hefe", "Zucker" will match in step 3!
      const step2 = mapped.steps[1];
      expect(step2.modeAnnotations!.length).toBe(1);
      expect(step2.modeAnnotations![0]).toEqual({
        matchedSubstring: "30 Sek./Stufe 10",
        mode: { type: "blend", time: 30, speed: "10" }
      });

      // Step 3: "Teig /2 Min." dough mode, plus ingredients
      const step3 = mapped.steps[2];
      expect(step3.modeAnnotations!.length).toBe(1);
      expect(step3.modeAnnotations![0]).toEqual({
        matchedSubstring: "Teig /2 Min.",
        mode: { type: "dough", time: 120 }
      });

      // Check ingredient annotations matched
      const matchedIngredients = step3.ingredientAnnotations!.map(a => a.matchedSubstring);
      expect(matchedIngredients).toContain("Weizenmehl");
      expect(matchedIngredients).toContain("Salz");
      expect(matchedIngredients).toContain("Wasser");
      expect(matchedIngredients).toContain("Hefe");
      expect(matchedIngredients).toContain("Zucker");
    });

    it("preserves explicit Turbo instructions instead of treating them as blend", () => {
      const officialPayload = {
        "@type": "Recipe",
        name: "Turbo Test",
        recipeYield: "1 Portion",
        recipeIngredient: ["50 g Parmesan"],
        recipeInstructions: [
          "Parmesan in den Mixtopf geben und Turbo/1 Sek. zerkleinern.",
          "Mit dem Spatel nach unten schieben und 3 x 0,5 Sek./Turbo zerkleinern.",
          "Parmesan in den Mixtopf geben und 10 Sek./Stufe 10 mahlen."
        ]
      };

      const mapped = mapOfficialCookidooToInput(officialPayload);

      expect(mapped.steps[0].modeAnnotations![0]).toEqual({
        matchedSubstring: "Turbo/1 Sek.",
        mode: { type: "turbo", pulseDuration: 1 }
      });
      expect(mapped.steps[1].modeAnnotations![0]).toEqual({
        matchedSubstring: "3 x 0,5 Sek./Turbo",
        mode: { type: "turbo", pulseDuration: 0.5, pulseCount: 3 }
      });
      expect(mapped.steps[2].modeAnnotations![0]).toEqual({
        matchedSubstring: "10 Sek./Stufe 10",
        mode: { type: "blend", time: 10, speed: "10" }
      });
    });
  });

  describe("mapCustomCookidooToInput", () => {
    it("maps custom Cookidoo draft payload correctly", () => {
      const customPayload = {
        recipeContent: {
          name: "My Creation",
          prepTime: 300, // 5 min in seconds
          totalTime: 900, // 15 min in seconds
          yield: {
            value: 2,
            unitText: "Portionen"
          },
          ingredients: [
            { text: "200g Mehl" }
          ],
          instructions: [
            {
              text: "Add 200g Mehl and knead Teig for 60 Sek..",
              annotations: [
                {
                  type: "INGREDIENT",
                  position: { offset: 4, length: 9 },
                  data: { description: "Mehl" }
                },
                {
                  type: "MODE",
                  name: "dough",
                  data: { time: 60 },
                  position: { offset: 18, length: 22 }
                }
              ]
            }
          ]
        }
      };

      const mapped = mapCustomCookidooToInput(customPayload);

      expect(mapped.title).toBe("My Creation");
      expect(mapped.prepTime).toBe(5);
      expect(mapped.totalTime).toBe(15);
      expect(mapped.servingSize).toBe(2);
      expect(mapped.servingUnitText).toBe("Portionen");
      expect(mapped.ingredients).toEqual([{ id: "ing-0", text: "200g Mehl" }]);

      expect(mapped.steps[0].ingredientAnnotations![0]).toEqual({
        matchedSubstring: "200g Mehl",
        ingredientId: "ing-0"
      });
      expect(mapped.steps[0].modeAnnotations![0]).toEqual({
        matchedSubstring: "knead Teig for 60 Sek.",
        mode: { type: "dough", time: 60 }
      });
    });

    it("maps custom Cookidoo drafts with string hints", () => {
      const customPayload = {
        recipeId: "01KSSGVJPJY3SQ8WXXQTKSFESF",
        recipeContent: {
          name: "Curry-Linsen-Suppe",
          prepTime: 600,
          totalTime: 2700,
          yield: {
            value: 2,
            unitText: "portion"
          },
          ingredients: [
            { type: "INGREDIENT", text: "75 g rote Linsen" }
          ],
          instructions: [
            {
              type: "STEP",
              text: "Rote Linsen zugeben und 2 Min./140°C anbraten.",
              annotations: [
                {
                  type: "INGREDIENT",
                  position: { offset: 0, length: 11 },
                  data: {
                    description: {
                      text: "75 g rote Linsen",
                      annotations: []
                    }
                  }
                },
                {
                  type: "MODE",
                  name: "browning",
                  position: { offset: 24, length: 21 },
                  data: {
                    time: 120,
                    temperature: { value: "140", unit: "C" },
                    power: "Gentle"
                  }
                }
              ],
              missedUsages: []
            }
          ],
          hints: "Zum Servieren etwas Kokosmilch zurückbehalten."
        }
      };

      const mapped = mapCustomCookidooToInput(customPayload);
      expect(mapped.title).toBe("Curry-Linsen-Suppe");
      expect(mapped.prepTime).toBe(10);
      expect(mapped.totalTime).toBe(45);
      expect(mapped.hints).toBe("Zum Servieren etwas Kokosmilch zurückbehalten.");
      expect(mapped.steps[0].ingredientAnnotations![0]).toEqual({
        matchedSubstring: "Rote Linsen",
        ingredientId: "ing-0"
      });
      expect(mapped.steps[0].modeAnnotations![0]).toEqual({
        matchedSubstring: "2 Min./140°C anbraten",
        mode: { type: "browning", time: 120, temperature: 140 }
      });
    });
  });

  describe("mapMonsieurCuisineToInput", () => {
    it("maps Monsieur Cuisine recipe draft payload correctly", () => {
      const mcPayload = {
        title: "MC Waffeln",
        description: "Delicious waffles",
        languageLocale: "de-DE",
        complexity: { id: 142 },
        status: "draft",
        nutrients: [{ name: "calories", unit: "kCal", amount: 350 }],
        servingSizes: [
          {
            amount: 6,
            unit: "Stück",
            preparationTime: 10,
            readyInTime: 20,
            ingredientGroups: [
              {
                name: "Hauptteig",
                ingredients: [
                  { name: "Mehl", amount: 250, unit: "g", isOptional: false }
                ]
              }
            ],
            steps: [
              {
                title: "",
                description: "Mehl in den Topf geben.",
                mode: {
                  type: "manualCooking",
                  deviceSettings: [{ time: 120, temperature: 0, speed: 3, clockwise: true }]
                }
              },
              {
                title: "Scale step",
                description: "Weigh sugar.",
                mode: {
                  type: "scale",
                  deviceSettings: [{ weight: 50 }]
                }
              }
            ]
          }
        ]
      };

      const mapped = mapMonsieurCuisineToInput(mcPayload);

      expect(mapped.title).toBe("MC Waffeln");
      expect(mapped.description).toBe("Delicious waffles");
      expect(mapped.settings.locale).toBe("de-DE");
      expect(mapped.settings.complexityId).toBe(142);
      expect(mapped.status).toBe("draft");
      expect(mapped.nutrients).toEqual([{ name: "calories", unit: "kCal", amount: 350 }]);

      const serving = mapped.servingSize;
      expect(serving.amount).toBe(6);
      expect(serving.unit).toBe("Stück");
      expect(serving.preparationTime).toBe(10);
      expect(serving.readyInTime).toBe(20);
      expect(serving.ingredientGroups[0].name).toBe("Hauptteig");
      expect(serving.ingredientGroups[0].ingredients).toEqual([
        { name: "Mehl", amount: 250, unit: "g", isOptional: false }
      ]);

      // Step 1: title becomes s.description since s.title was empty and it's manualCooking
      expect(serving.steps[0].title).toBe("Mehl in den Topf geben.");
      expect(serving.steps[0].description).toBe("");
      expect(serving.steps[0].mode).toEqual({
        type: "manualCooking",
        temperature: 0,
        minutes: 2,
        seconds: 0,
        speed: 3,
        rotationDirection: "right"
      });

      // Step 2: title remains s.title since s.title was not empty, description holds "Weigh sugar."
      expect(serving.steps[1].title).toBe("Scale step");
      expect(serving.steps[1].description).toBe("Weigh sugar.");
      expect(serving.steps[1].mode).toEqual({
        type: "scale",
        grams: 50
      });
    });
  });

  describe("formatRecipeForTerminal integration", () => {
    it("successfully pretty prints Thermomix and Monsieur Cuisine recipes", () => {
      const officialPayload = {
        "@type": "Recipe",
        name: "Klassische Waffeln",
        recipeIngredient: ["250 g Mehl"],
        recipeInstructions: ["Teig /1 Min. kneten."]
      };

      const formattedTm = stripAnsi(formatRecipeForTerminal("tm", officialPayload));
      expect(formattedTm).toContain("Klassische Waffeln");
      expect(formattedTm).toContain("Ingredients:");
      expect(formattedTm).toContain("• 250 g Mehl");
      expect(formattedTm).toContain("Steps:");
      expect(formattedTm).toContain("Teig /1 Min. kneten.");
      expect(formattedTm).toContain("[Mode: dough | \"Teig /1 Min.\" | 60s]");

      const officialWithoutType = {
        name: "Baklava",
        recipeIngredientGroups: [
          {
            recipeIngredients: [
              { quantity: { value: 250 }, unitNotation: "g", ingredientNotation: "Mandeln" }
            ]
          }
        ],
        recipeStepGroups: [
          {
            recipeSteps: [
              { formattedText: "Mandeln 10 Sek./Stufe 7 zerkleinern." }
            ]
          }
        ]
      };

      const formattedOfficialWithoutType = stripAnsi(formatRecipeForTerminal("tm", officialWithoutType));
      expect(formattedOfficialWithoutType).toContain("Baklava");
      expect(formattedOfficialWithoutType).toContain("• 250 g Mandeln");
      expect(formattedOfficialWithoutType).toContain("10 Sek./Stufe 7");

      const mcPayload = {
        title: "MC Waffeln",
        servingSizes: [
          {
            amount: 6,
            unit: "Stück",
            ingredientGroups: [
              {
                ingredients: [{ name: "Mehl", amount: 250, unit: "g" }]
              }
            ],
            steps: [
              {
                title: "Scale step",
                description: "Weigh sugar.",
                mode: {
                  type: "scale",
                  deviceSettings: [{ weight: 50 }]
                }
              }
            ]
          }
        ]
      };

      const formattedMc = stripAnsi(formatRecipeForTerminal("mc", mcPayload));
      expect(formattedMc).toContain("MC Waffeln");
      expect(formattedMc).toContain("Zutaten"); // Localized ingredients in German de-DE
      expect(formattedMc).toContain("• 250 g Mehl");
      expect(formattedMc).toContain("Schritte"); // Localized steps in German de-DE
      expect(formattedMc).toContain("[Wiegen: 50 g]");

      const wrappedFormattedMc = stripAnsi(formatRecipeForTerminal("mc", { data: { recipe: mcPayload } }));
      expect(wrappedFormattedMc).toContain("MC Waffeln");
      expect(wrappedFormattedMc).toContain("• 250 g Mehl");
    });
  });

  describe("formatUserForTerminal", () => {
    it("formats Thermomix user profile beautifully", () => {
      const user = {
        givenName: "Max",
        lastName: "Mustermann",
        email: "max@example.com",
        locale: "de-DE"
      };
      const formatted = stripAnsi(formatUserForTerminal("tm", user));
      expect(formatted).toContain("User Session Profile");
      expect(formatted).toContain("Device:     Thermomix (Cookidoo)");
      expect(formatted).toContain("Name:       Max Mustermann");
      expect(formatted).toContain("Email:      max@example.com");
      expect(formatted).toContain("Locale:     de-DE");
    });

    it("formats Thermomix Cookidoo profile details from the me endpoint", () => {
      const user = {
        id: "b8af53c0-c215-4842-bdd3-caa32f65b3a2",
        savedSearches: [
          {
            id: "default",
            search: {
              countries: ["de"],
              languages: [],
              accessories: [
                "includingFriend",
                "includingBladeCover",
                "includingBladeCoverWithPeeler",
                "includingCutter",
                "includingCutterPlus",
                "includingSensor"
              ]
            }
          }
        ],
        foodPreferences: [],
        isPublic: false,
        userInfo: {
          username: "cookidoo-user",
          picture: "",
          pictureTemplate: ""
        },
        meta: {
          cloudinaryPublicId: "d8b62700"
        },
        thermomixes: []
      };

      const formatted = stripAnsi(formatUserForTerminal("tm", user));
      expect(formatted).toContain("ID:         b8af53c0-c215-4842-bdd3-caa32f65b3a2");
      expect(formatted).toContain("Name:       cookidoo-user");
      expect(formatted).toContain("Public:     no");
      expect(formatted).toContain("Saved Searches");
      expect(formatted).toContain("1. default");
      expect(formatted).toContain("Countries:    de");
      expect(formatted).toContain("Languages:    None");
      expect(formatted).toContain("Thermomix Cutter (includingCutter)");
      expect(formatted).toContain("Thermomix Sensor (includingSensor)");
      expect(formatted).toContain("Food Preferences");
      expect(formatted).toContain("Thermomixes");
      expect(formatted).toContain("None registered in profile response");
      expect(formatted).toContain("cloudinaryPublicId: d8b62700");
    });

    it("formats Monsieur Cuisine user profile beautifully", () => {
      const user = {
        nickname: "SuperCook",
        email: "cook@mc.com",
        languageLocale: "fr-FR"
      };
      const formatted = stripAnsi(formatUserForTerminal("mc", user));
      expect(formatted).toContain("User Session Profile");
      expect(formatted).toContain("Device:     Monsieur Cuisine");
      expect(formatted).toContain("Name:       SuperCook");
      expect(formatted).toContain("Email:      cook@mc.com");
      expect(formatted).toContain("Locale:     fr-FR");
    });
  });

  describe("formatDraftsForTerminal", () => {
    it("handles empty draft lists gracefully", () => {
      const result = { recipes: [] };
      const formatted = stripAnsi(formatDraftsForTerminal("tm", result));
      expect(formatted).toContain("Draft Recipes List (0 drafts found)");
      expect(formatted).toContain("No drafts found on this device.");
    });

    it("formats drafts lists beautifully with names, status, IDs, URLs, and dates", () => {
      const result = {
        recipes: [
          {
            id: "draft-id-123",
            title: "Vollwert-Brötchen",
            status: "draft",
            recipeUrl: "https://cookidoo.de/created-recipes/de-DE/draft-id-123",
            updatedAt: "2026-05-29T10:00:00.000Z"
          }
        ]
      };
      const formatted = stripAnsi(formatDraftsForTerminal("tm", result));
      expect(formatted).toContain("Draft Recipes List (1 drafts found)");
      expect(formatted).toContain("[1]  Vollwert-Brötchen (draft)");
      expect(formatted).toContain("ID:  draft-id-123");
      expect(formatted).toContain("URL: https://cookidoo.de/created-recipes/de-DE/draft-id-123");
      expect(formatted).toContain("Updated: 2026-05-29");
    });
  });
});
