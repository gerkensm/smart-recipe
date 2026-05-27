import { describe, expect, it } from "vitest";
import { makeOpenAIStrictSchema } from "../src/llm/schema-format.js";
import { RecipeInputSchema } from "../src/recipes/schema.js";

describe("OpenAI strict schema formatting", () => {
  it("keeps mode unions nested under an object root", () => {
    const schema = makeOpenAIStrictSchema(RecipeInputSchema);
    const stepsItems = (schema.properties as any).servingSize.properties.steps.items;
    const mode0 = stepsItems.anyOf[0].properties.mode;
    const mode1 = stepsItems.anyOf[1].properties.mode;

    expect(schema.type).toBe("object");
    expect(schema.anyOf).toBeUndefined();
    expect(schema.required).toContain("status");
    expect(mode0.anyOf).toHaveLength(3);
    expect(mode1.anyOf).toHaveLength(17);
  });

  it("converts TypeBox const literals to enums for OpenAI", () => {
    const schema = makeOpenAIStrictSchema(RecipeInputSchema);
    const values: unknown[] = [];
    collectKeys(schema, "const", values);

    const stepsItems = (schema.properties as any).servingSize.properties.steps.items;
    const mode1 = stepsItems.anyOf[1].properties.mode;
    const manualCooking = mode1.anyOf.find((variant: any) => variant.properties?.type?.enum?.[0] === "manualCooking");

    expect(values).toEqual([]);
    expect(manualCooking.properties.type).toEqual({ type: "string", enum: ["manualCooking"] });
  });
});

function collectKeys(value: unknown, key: string, output: unknown[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, key, output));
    return;
  }
  const object = value as Record<string, unknown>;
  if (key in object) output.push(object[key]);
  Object.values(object).forEach((item) => collectKeys(item, key, output));
}
