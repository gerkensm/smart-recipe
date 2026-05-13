import { describe, expect, it } from "vitest";
import { makeOpenAIStrictSchema } from "../src/llm/schema-format.js";
import { RecipeInputSchema } from "../src/recipes/schema.js";

describe("OpenAI strict schema formatting", () => {
  it("keeps mode unions nested under an object root", () => {
    const schema = makeOpenAIStrictSchema(RecipeInputSchema);
    const mode = (((schema.properties as any).servingSize.properties.steps.items.properties as any).mode ?? {}) as any;

    expect(schema.type).toBe("object");
    expect(schema.anyOf).toBeUndefined();
    expect(schema.required).toContain("status");
    expect(mode.anyOf).toHaveLength(20);
  });

  it("converts TypeBox const literals to enums for OpenAI", () => {
    const schema = makeOpenAIStrictSchema(RecipeInputSchema);
    const values: unknown[] = [];
    collectKeys(schema, "const", values);

    const mode = (((schema.properties as any).servingSize.properties.steps.items.properties as any).mode ?? {}) as any;
    const manualCooking = mode.anyOf.find((variant: any) => variant.properties?.type?.enum?.[0] === "manualCooking");

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
