import { describe, expect, it } from "vitest";
import { createDeviceApi, type DeviceApiOptions } from "../src/devices/index.js";
import type { DeviceAdapter } from "../src/devices/adapter.js";

interface FakeInput {
  title: string;
  normalized?: boolean;
}

interface FakePayload {
  payloadTitle: string;
}

function fakeAdapter(): DeviceAdapter<FakeInput, FakePayload> {
  return {
    id: "mc",
    deviceName: "MonsieurCuisine",
    getSchema: () => ({}),
    getPromptInstructions: () => "",
    validateInput: () => ({ ok: true, errors: [] }),
    normalizeInput: (input) => ({ ...input, normalized: true }),
    formatInputForTerminal: (input) => `formatted:${input.title}`,
    browserLogin: async () => ({ cookie: "fresh", source: "test", cookieNames: ["sid"] }),
    getCurrentUser: async (cookie) => ({ id: "user", cookie }),
    listDrafts: async (options) => ({ recipes: [], cookie: options.cookie, size: options.size }),
    getRecipe: async (options) => ({ id: options.id, cookie: options.cookie, public: options.public }),
    createPayload: (input) => ({ payloadTitle: input.title }),
    upload: async (options) => ({
      recipeUrl: "https://example.test/recipe",
      draft: { id: "draft" },
      payload: options.payload,
    }),
  };
}

describe("DeviceApi", () => {
  it("exposes consistent device methods over an adapter", async () => {
    const api = createDeviceApi<FakeInput, FakePayload>({
      device: "mc",
      cookie: "saved-cookie",
      adapter: fakeAdapter(),
    } satisfies DeviceApiOptions);

    await expect(api.getProfile()).resolves.toEqual({ id: "user", cookie: "saved-cookie" });
    await expect(api.listRecipes({ size: 5 })).resolves.toEqual({ recipes: [], cookie: "saved-cookie", size: 5 });
    await expect(api.getRecipe({ id: "123" })).resolves.toEqual({ id: "123", cookie: "saved-cookie", public: undefined });

    expect(api.normalizeInput({ title: "Soup" })).toEqual({ title: "Soup", normalized: true });
    expect(api.formatInputForTerminal({ title: "Soup" })).toBe("formatted:Soup");
    expect(api.createPayload({ title: "Soup" })).toEqual({ payloadTitle: "Soup" });

    await expect(api.uploadRecipe({
      page: { url: "", finalUrl: "", title: "Soup", markdown: "", html: "", images: [] },
      recipeInput: { title: "Soup" },
    })).resolves.toMatchObject({
      recipeUrl: "https://example.test/recipe",
      draft: { id: "draft" },
      payload: { payloadTitle: "Soup" },
    });
  });

  it("requires a cookie for authenticated methods", async () => {
    const api = createDeviceApi({ device: "mc", adapter: fakeAdapter() });
    expect(() => api.getProfile()).toThrow("No MonsieurCuisine cookie configured.");
  });
});
