import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mcHasFoodProcessor } from "../src/config/env.js";

describe("mcHasFoodProcessor config helper", () => {
  let originalEnvValue: string | undefined;

  beforeEach(() => {
    originalEnvValue = process.env.MC_HAS_FOOD_PROCESSOR;
  });

  afterEach(() => {
    if (originalEnvValue === undefined) {
      delete process.env.MC_HAS_FOOD_PROCESSOR;
    } else {
      process.env.MC_HAS_FOOD_PROCESSOR = originalEnvValue;
    }
  });

  it("should return false by default when env variable is not set", () => {
    delete process.env.MC_HAS_FOOD_PROCESSOR;
    expect(mcHasFoodProcessor()).toBe(false);
  });

  it("should return true when env variable is set to 'true' (case-insensitive)", () => {
    process.env.MC_HAS_FOOD_PROCESSOR = "true";
    expect(mcHasFoodProcessor()).toBe(true);

    process.env.MC_HAS_FOOD_PROCESSOR = "TRUE";
    expect(mcHasFoodProcessor()).toBe(true);
  });

  it("should return false when env variable is set to 'false' (case-insensitive)", () => {
    process.env.MC_HAS_FOOD_PROCESSOR = "false";
    expect(mcHasFoodProcessor()).toBe(false);

    process.env.MC_HAS_FOOD_PROCESSOR = "FALSE";
    expect(mcHasFoodProcessor()).toBe(false);
  });

  it("should return false for any other values that are not 'true'", () => {
    process.env.MC_HAS_FOOD_PROCESSOR = "yes";
    expect(mcHasFoodProcessor()).toBe(false);

    process.env.MC_HAS_FOOD_PROCESSOR = "";
    expect(mcHasFoodProcessor()).toBe(false);
  });
});
