import OpenAI from "openai";
import { RecipeInputSchema, type RecipeInput } from "../recipes/schema.js";
import { assertRecipeInput, validateRecipeInput } from "../recipes/validation.js";
import { normalizeRecipeInput } from "../recipes/normalize.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import type { RecipeGenerationOptions, RecipeGenerator } from "./types.js";
import { makeOpenAIStrictSchema } from "./schema-format.js";
import { buildRecipeInstructions } from "./prompts.js";

export interface OpenAIRecipeGeneratorOptions extends RecipeGenerationOptions {
  client?: OpenAI;
}

export class OpenAIRecipeGenerator implements RecipeGenerator {
  private readonly client: OpenAI;
  private readonly defaults: Required<RecipeGenerationOptions>;

  constructor(options: OpenAIRecipeGeneratorOptions = {}) {
    this.client = options.client ?? new OpenAI();
    this.defaults = {
      model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-5.5",
      reasoningEffort: options.reasoningEffort ?? (process.env.OPENAI_REASONING_EFFORT as any) ?? "medium",
      locale: options.locale ?? "de-DE",
      maxCorrectionAttempts: options.maxCorrectionAttempts ?? 3
    };
  }

  async generate(page: RetrievedRecipePage, options: RecipeGenerationOptions = {}): Promise<RecipeInput> {
    const finalOptions = { ...this.defaults, ...options };
    let feedback: { errors: string[]; previous: unknown } | undefined;

    for (let attempt = 0; attempt <= finalOptions.maxCorrectionAttempts; attempt += 1) {
      const output = await this.generateOnce(page, finalOptions, feedback);
      const validation = validateRecipeInput(output);
      if (validation.ok) {
        assertRecipeInput(output);
        return normalizeRecipeInput(output);
      }
      feedback = { errors: validation.errors, previous: output };
    }

    throw new Error(`OpenAI output failed validation after ${finalOptions.maxCorrectionAttempts} correction attempts:\n${feedback?.errors.join("\n")}`);
  }

  private async generateOnce(
    page: RetrievedRecipePage,
    options: Required<RecipeGenerationOptions>,
    feedback?: { errors: string[]; previous: unknown }
  ): Promise<unknown> {
    const strictSchema = makeOpenAIStrictSchema(RecipeInputSchema);
    const fullSchemaText = JSON.stringify(RecipeInputSchema, null, 2);
    const correctionText = feedback
      ? [
        "Previous generated JSON failed validation.",
        "Validation errors:",
        feedback.errors.join("\n"),
        "",
        "Previous JSON:",
        JSON.stringify(feedback.previous, null, 2),
        "",
        "Return corrected JSON only."
      ].join("\n")
      : "";

    const response = await (this.client as any).responses.create({
      model: options.model,
      reasoning: { effort: options.reasoningEffort },
      text: {
        format: {
          type: "json_schema",
          name: "monsieur_cuisine_smart_recipe",
          strict: true,
          description: "Model-friendly Monsieur Cuisine Smart recipe input.",
          schema: strictSchema
        }
      },
      instructions: buildRecipeInstructions(options.locale),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Source URL: ${page.finalUrl || page.url}`,
                `Detected title: ${page.title}`,
                `Preferred locale: ${options.locale}`,
                "",
                "Full schema with detailed descriptions:",
                fullSchemaText,
                correctionText,
                "",
                "Recipe page as Markdown:",
                page.markdown
              ].filter(Boolean).join("\n")
            },
            ...page.images
              .filter((image) => image.dataUrl)
              .slice(0, 3)
              .map((image, index) => ({
                type: "input_image",
                image_url: image.dataUrl,
                detail: index === 0 ? "high" : "low"
              }))
          ]
        }
      ]
    });

    return JSON.parse(response.output_text);
  }
}
