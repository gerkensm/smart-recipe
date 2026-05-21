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
      maxCorrectionAttempts: options.maxCorrectionAttempts ?? 3,
      excludeModes: options.excludeModes ?? []
    };
  }

  async generate(page: RetrievedRecipePage, options: RecipeGenerationOptions = {}): Promise<RecipeInput> {
    const cleanOptions = Object.fromEntries(
      Object.entries(options).filter(([_, v]) => v !== undefined)
    );
    const finalOptions = { ...this.defaults, ...cleanOptions };
    let feedback: { errors: string[]; previous: unknown } | undefined;

    for (let attempt = 0; attempt <= finalOptions.maxCorrectionAttempts; attempt += 1) {
      const output = await this.generateOnce(page, finalOptions, feedback);
      const validation = validateRecipeInput(output);
      const excludedErrors = validateExcludedModes(output, finalOptions.excludeModes);
      const allErrors = [...validation.errors, ...excludedErrors];
      if (validation.ok && excludedErrors.length === 0) {
        assertRecipeInput(output);
        return normalizeRecipeInput(output);
      }
      feedback = { errors: allErrors, previous: output };
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
      instructions: buildRecipeInstructions(options.locale, options.excludeModes),
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

/**
 * Checks that none of the recipe steps use a mode that was excluded for this generation run.
 * Returns an array of human-readable error strings suitable for feeding back to the LLM.
 */
function validateExcludedModes(output: unknown, excludeModes: string[] = []): string[] {
  const finalExcludeModes = excludeModes ?? [];
  if (!finalExcludeModes.length || typeof output !== "object" || !output) return [];
  const excluded = new Set(finalExcludeModes);
  const errors: string[] = [];
  const steps: unknown[] = (output as any)?.servingSize?.steps ?? [];
  steps.forEach((step: any, index: number) => {
    const modeType = step?.mode?.type;
    if (modeType && excluded.has(modeType)) {
      errors.push(`/servingSize/steps/${index}/mode/type must not be "${modeType}" — this mode requires an accessory the user does not own. Replace it with an alternative mode or type "none".`);
    }
  });
  return errors;
}
