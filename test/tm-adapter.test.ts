import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Buffer } from "node:buffer";
import { ThermomixAdapter } from "../src/devices/tm/adapter.js";
import { CookidooClient } from "../src/devices/tm/client.js";
import { CookidooAuthError, CookidooRateLimitError } from "../src/devices/tm/errors.js";
import type { CookidooRecipeInput } from "../src/devices/tm/schema.js";
import { getImageDimensions } from "../src/devices/tm/payload.js";
import { passwordLoginForCookidoo } from "../src/devices/tm/browser-login.js";


const sampleInput: CookidooRecipeInput = {
  title: "Test Recipe",
  prepTime: 10,
  totalTime: 30,
  servingSize: 4,
  servingUnitText: "portions",
  ingredients: [
    { id: "mehl", text: "100g flour" },
    { id: "zucker", text: "50g sugar" }
  ],
  steps: [
    {
      text: "Put flour and sugar into mixing bowl.",
      ingredientAnnotations: [],
      modeAnnotations: []
    }
  ],
  hints: "",
  settings: {
    locale: "de-DE"
  }
};

describe("ThermomixAdapter", () => {
  let adapter: ThermomixAdapter;

  beforeEach(() => {
    adapter = new ThermomixAdapter();
  });

  describe("Validation and Normalization", () => {
    it("validates a correct recipe input structure", () => {
      const result = adapter.validateInput(sampleInput);
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("fails validation if required fields are missing", () => {
      const invalid = { ...sampleInput, title: undefined };
      const result = adapter.validateInput(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("normalizes and trims string fields", () => {
      const unnormalized: CookidooRecipeInput = {
        ...sampleInput,
        title: "  Test Recipe   ",
        ingredients: [
          { id: "  mehl  ", text: "  100g flour " },
          { id: "zucker", text: " 50g sugar" }
        ] as any,
        steps: [
          {
            text: " Put flour and sugar.  ",
            modeAnnotations: [
              {
                matchedSubstring: "  flour and sugar  ",
                mode: { type: "dough", time: 60 }
              }
            ]
          }
        ]
      };
      const normalized = adapter.normalizeInput(unnormalized);
      expect(normalized.title).toBe("Test Recipe");
      expect(normalized.ingredients).toEqual([
        { id: "mehl", text: "100g flour" },
        { id: "zucker", text: "50g sugar" }
      ]);
      expect(normalized.steps[0].text).toBe("Put flour and sugar.");
      expect(normalized.steps[0].modeAnnotations?.[0].matchedSubstring).toBe("flour and sugar");
    });
  });

  describe("Payload generation and modes constraints", () => {
    it("omits tools array parameter in metadata updates", () => {
      const payload = adapter.createPayload(sampleInput);
      expect(payload.meta).toBeDefined();
      expect((payload.meta as any).tools).toBeUndefined();
      expect(payload.meta.name).toBe("Test Recipe");
      expect(payload.meta.prepTime).toBe(600); // 10 minutes to seconds
    });

    it("calculates correct substring offset and length", () => {
      const inputWithModes: CookidooRecipeInput = {
        ...sampleInput,
        steps: [
          {
            text: "Add 100g flour and knead dough for 2 minutes/dough.",
            modeAnnotations: [
              {
                matchedSubstring: "knead dough for 2 minutes/dough",
                mode: { type: "dough", time: 120 }
              }
            ]
          }
        ]
      };
      const payload = adapter.createPayload(inputWithModes);
      const step = payload.instructions[0];
      expect(step.annotations).toBeDefined();
      expect(step.annotations!.length).toBe(1);
      expect(step.annotations![0].position).toEqual({
        offset: 19,
        length: 31
      });
      expect(step.annotations![0].name).toBe("dough");
      expect(step.annotations![0].data.time).toBe(120);
    });

    it("drops ingredient annotations with non-existent ingredient ID gracefully", () => {
      const inputWithInvalidIngredient: CookidooRecipeInput = {
        ...sampleInput,
        steps: [
          {
            text: "Add flour.",
            ingredientAnnotations: [
              {
                matchedSubstring: "flour",
                ingredientId: "non-existent-id"
              }
            ]
          }
        ]
      };
      const payload = adapter.createPayload(inputWithInvalidIngredient);
      const step = payload.instructions[0];
      expect(step.annotations).toBeUndefined();
    });

    it("sorts annotations by offset ascending", () => {
      const inputWithMultipleModes: CookidooRecipeInput = {
        ...sampleInput,
        steps: [
          {
            text: "Knead for 60s, then blend speed 6 for 30s.",
            modeAnnotations: [
              {
                matchedSubstring: "blend speed 6 for 30s",
                mode: { type: "blend", time: 30, speed: "6" }
              },
              {
                matchedSubstring: "Knead for 60s",
                mode: { type: "dough", time: 60 }
              }
            ]
          }
        ]
      };
      const payload = adapter.createPayload(inputWithMultipleModes);
      const annotations = payload.instructions[0].annotations;
      expect(annotations).toBeDefined();
      expect(annotations!.length).toBe(2);
      expect(annotations![0].name).toBe("dough"); // "Knead for 60s" comes first
      expect(annotations![1].name).toBe("blend"); // "blend speed 6 for 30s" comes second
    });

    it("enforces steaming mode constraints: omits temperature completely", () => {
      const inputSteaming: CookidooRecipeInput = {
        ...sampleInput,
        steps: [
          {
            text: "Steam veggies for 15 min/Varoma/speed 1.",
            modeAnnotations: [
              {
                matchedSubstring: "Steam veggies for 15 min/Varoma/speed 1",
                mode: {
                  type: "steaming",
                  time: 900,
                  speed: "1",
                  accessory: "Varoma"
                }
              }
            ]
          }
        ]
      };
      const payload = adapter.createPayload(inputSteaming);
      const annotation = payload.instructions[0].annotations![0];
      expect(annotation.name).toBe("steaming");
      expect((annotation.data as any).temperature).toBeUndefined();
      expect(annotation.data.time).toBe(900);
      expect(annotation.data.speed).toBe("1");
      expect((annotation.data as any).accessory).toBe("Varoma");
    });

    it("maps Gareinsatz and both steaming accessories to SimmeringBasket and VaromaAndSimmeringBasket", () => {
      const inputGareinsatz: CookidooRecipeInput = {
        ...sampleInput,
        steps: [
          {
            text: "Steam in basket for 10 min/Gareinsatz.",
            modeAnnotations: [
              {
                matchedSubstring: "Steam in basket for 10 min/Gareinsatz",
                mode: {
                  type: "steaming",
                  time: 600,
                  speed: "1",
                  accessory: "Gareinsatz" as any
                }
              }
            ]
          }
        ]
      };
      const inputBoth: CookidooRecipeInput = {
        ...sampleInput,
        steps: [
          {
            text: "Steam in both for 10 min/both.",
            modeAnnotations: [
              {
                matchedSubstring: "Steam in both for 10 min/both",
                mode: {
                  type: "steaming",
                  time: 600,
                  speed: "1",
                  accessory: "both" as any
                }
              }
            ]
          }
        ]
      };

      const payloadGareinsatz = adapter.createPayload(inputGareinsatz);
      const annotationGareinsatz = payloadGareinsatz.instructions[0].annotations![0];
      expect((annotationGareinsatz.data as any).accessory).toBe("SimmeringBasket");

      const payloadBoth = adapter.createPayload(inputBoth);
      const annotationBoth = payloadBoth.instructions[0].annotations![0];
      expect((annotationBoth.data as any).accessory).toBe("VaromaAndSimmeringBasket");
    });

    it("enforces browning mode constraints: clamps temperature and omits power", () => {
      const inputBrowning: CookidooRecipeInput = {
        ...sampleInput,
        steps: [
          {
            text: "Sear beef 5 min/142C.",
            modeAnnotations: [
              {
                matchedSubstring: "Sear beef 5 min/142C",
                mode: {
                  type: "browning",
                  time: 300,
                  temperature: 142 as any,
                  power: "Intensive" as any
                }
              }
            ]
          },
          {
            text: "Sear chicken 5 min/158C.",
            modeAnnotations: [
              {
                matchedSubstring: "Sear chicken 5 min/158C",
                mode: {
                  type: "browning",
                  time: 300,
                  temperature: 158 as any
                }
              }
            ]
          }
        ]
      };
      const payload = adapter.createPayload(inputBrowning);
      const ann1 = payload.instructions[0].annotations![0];
      const ann2 = payload.instructions[1].annotations![0];

      expect(ann1.name).toBe("browning");
      expect(ann1.data.temperature!.value).toBe("140"); // 142 is closest to 140
      expect(ann1.data.power).toBeUndefined();

      expect(ann2.name).toBe("browning");
      expect(ann2.data.temperature!.value).toBe("160"); // 158 is closest to 160
      expect(ann2.data.power).toBeUndefined();
    });
  });

  describe("Prompt Instructions Versioning", () => {
    const originalEnv = process.env.TM_VERSION;

    afterEach(() => {
      process.env.TM_VERSION = originalEnv;
    });

    it("generates instructions targeting TM6 by default", () => {
      const prompt = adapter.getPromptInstructions("de-DE");
      expect(prompt).toContain("Target: Thermomix (TM6)");
      expect(prompt).toContain("Target device is TM6");
    });

    it("generates instructions targeting TM5 when specified", () => {
      const prompt = adapter.getPromptInstructions("de-DE", { version: "TM5" });
      expect(prompt).toContain("Target: Thermomix (TM5)");
      expect(prompt).toContain("Target device is TM5");
    });

    it("generates instructions targeting TM7 when specified", () => {
      const prompt = adapter.getPromptInstructions("de-DE", { version: "TM7" });
      expect(prompt).toContain("Target: Thermomix (TM7)");
      expect(prompt).toContain("Target device is TM7");
    });

    it("respects tmVersion option key", () => {
      const prompt = adapter.getPromptInstructions("de-DE", { tmVersion: "tm7" });
      expect(prompt).toContain("Target: Thermomix (TM7)");
      expect(prompt).toContain("Target device is TM7");
    });

    it("respects process.env.TM_VERSION when no option is provided", () => {
      process.env.TM_VERSION = "tm5";
      const prompt = adapter.getPromptInstructions("de-DE");
      expect(prompt).toContain("Target: Thermomix (TM5)");
    });
  });

  describe("Draft listing", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      delete process.env.TM_LOCALE;
    });

    it("maps Cookidoo created-recipes items responses", async () => {
      const mockRequest = vi.spyOn(CookidooClient.prototype, "request");
      mockRequest.mockResolvedValueOnce({
        meta: {
          recipeLimit: 150,
          recipeLimitThreshold: 5
        },
        items: [
          {
            recipeId: "01K2CTJ9Y1BABRG5MXK44CFZS4",
            modifiedAt: "2026-05-29T10:00:00.000Z",
            status: "ACTIVE",
            workStatus: "PRIVATE",
            recipeContent: {
              name: "Vongole alla marinara",
              tools: ["TM7", "TM6", "TM5"]
            }
          }
        ]
      });

      const result = await adapter.listDrafts({
        cookie: "_oauth2_proxy=foo; v-authenticated=bar",
        size: 20
      });

      expect(mockRequest).toHaveBeenCalledWith({
        method: "GET",
        path: "/created-recipes/de-DE"
      });
      expect(result.data.total).toBe(1);
      expect(result.data.recipes).toEqual([
        {
          id: "01K2CTJ9Y1BABRG5MXK44CFZS4",
          title: "Vongole alla marinara",
          status: "PRIVATE",
          updatedAt: "2026-05-29T10:00:00.000Z",
          deviceTypes: ["TM7", "TM6", "TM5"],
          ingredientCount: undefined,
          stepCount: undefined,
          hasImage: false,
          hasHints: false,
          recipeUrl: "https://cookidoo.de/created-recipes/de-DE/01K2CTJ9Y1BABRG5MXK44CFZS4"
        }
      ]);
    });

    it("uses TM_LOCALE when listing drafts", async () => {
      process.env.TM_LOCALE = "en-US";
      const mockRequest = vi.spyOn(CookidooClient.prototype, "request");
      mockRequest.mockResolvedValueOnce([]);

      await adapter.listDrafts({
        cookie: "_oauth2_proxy=foo; v-authenticated=bar",
        size: 20
      });

      expect(mockRequest).toHaveBeenCalledWith({
        method: "GET",
        path: "/created-recipes/en-US"
      });
    });
  });

  describe("Upload client copy rate limit backoff retry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("retries copying from public on rate limit status 429 and succeeds on next attempt", async () => {
      const mockRequest = vi.spyOn(CookidooClient.prototype, "request");

      // First call to request fails with 429 (CookidooRateLimitError)
      mockRequest.mockRejectedValueOnce(
        new CookidooRateLimitError({
          status: 429,
          body: { code: "tooManyRequests" },
          url: "/created-recipes/de-DE",
          method: "POST",
          retryAfterMs: 30000
        })
      );

      // Second, third, and fourth calls succeed (POST copy, PATCH meta, PATCH instructions)
      mockRequest.mockResolvedValueOnce({ recipeId: "draft-recipe-id-123" });
      mockRequest.mockResolvedValueOnce({ success: true });
      mockRequest.mockResolvedValueOnce({ success: true });

      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const uploadPromise = adapter.upload({
        payload: adapter.createPayload(sampleInput),
        recipeInput: sampleInput,
        page: {
          url: "https://example.com/recipe",
          finalUrl: "https://example.com/recipe",
          title: "Test Recipe",
          markdown: "",
          html: "",
          images: []
        },
        locale: "de-DE",
        cookie: "_oauth2_proxy=foo; v-authenticated=bar; v-is-authenticated=true",
        logger
      });

      // Wait a tick for the async call to run and trigger the catch block with delay
      await vi.advanceTimersByTimeAsync(0);

      // Verify that it warned about rate limiting and is now waiting
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 1, delayMs: 30000 }),
        expect.stringContaining("rate limited by Cookidoo copy API")
      );

      // Advance time by 30 seconds to trigger retry
      await vi.advanceTimersByTimeAsync(30000);

      const result = await uploadPromise;

      expect(result.recipeUrl).toBe("https://cookidoo.de/created-recipes/de-DE/draft-recipe-id-123");
      expect(result.draft.id).toBe("draft-recipe-id-123");
      expect(mockRequest).toHaveBeenCalledTimes(4);
    });

    it("gives up retrying after maximum attempts exceed", async () => {
      const mockRequest = vi.spyOn(CookidooClient.prototype, "request");

      // Reject all attempts with 429
      mockRequest.mockRejectedValue(
        new CookidooRateLimitError({
          status: 429,
          body: { code: "tooManyRequests" },
          url: "/created-recipes/de-DE",
          method: "POST",
          retryAfterMs: 1000
        })
      );

      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const uploadPromise = adapter.upload({
        payload: adapter.createPayload(sampleInput),
        recipeInput: sampleInput,
        page: {
          url: "https://example.com/recipe",
          finalUrl: "https://example.com/recipe",
          title: "Test Recipe",
          markdown: "",
          html: "",
          images: []
        },
        locale: "de-DE",
        cookie: "_oauth2_proxy=foo; v-authenticated=bar; v-is-authenticated=true",
        logger
      });

      // Prevent unhandled rejection warning in Node.js
      uploadPromise.catch(() => {});

      // We need to advance timers repeatedly to go through all 4 delays
      // delays: [30_000, 60_000, 90_000, 120_000]
      // Let's loop and advance
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(120_000);
      }

      await expect(uploadPromise).rejects.toThrow(CookidooRateLimitError);
    });

    it("accepts nested Cookidoo copy responses when extracting the new draft ID", async () => {
      const mockRequest = vi.spyOn(CookidooClient.prototype, "request");
      mockRequest.mockResolvedValueOnce({ data: { recipe: { recipeId: "nested-draft-id-123" } } });
      mockRequest.mockResolvedValueOnce({ success: true });
      mockRequest.mockResolvedValueOnce({ success: true });

      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      };

      const result = await adapter.upload({
        payload: adapter.createPayload(sampleInput),
        recipeInput: sampleInput,
        page: {
          url: "https://example.com/recipe",
          finalUrl: "https://example.com/recipe",
          title: "Test Recipe",
          markdown: "",
          html: "",
          images: []
        },
        locale: "de-DE",
        cookie: "_oauth2_proxy=foo; v-authenticated=bar; v-is-authenticated=true",
        logger
      });

      expect(result.draft.id).toBe("nested-draft-id-123");
      expect(result.recipeUrl).toBe("https://cookidoo.de/created-recipes/de-DE/nested-draft-id-123");
    });
  });

  describe("Image Upload & Dimensions Parsing", () => {
    it("correctly parses valid PNG dimensions", () => {
      const pngHeader = Buffer.alloc(24);
      pngHeader.writeUInt8(0x89, 0);
      pngHeader.writeUInt8(0x50, 1);
      pngHeader.writeUInt8(0x4e, 2);
      pngHeader.writeUInt8(0x47, 3);
      pngHeader.writeUInt8(0x0d, 4);
      pngHeader.writeUInt8(0x0a, 5);
      pngHeader.writeUInt8(0x1a, 6);
      pngHeader.writeUInt8(0x0a, 7);
      pngHeader.writeUInt32BE(800, 16); // width
      pngHeader.writeUInt32BE(600, 20); // height

      const dims = getImageDimensions(pngHeader);
      expect(dims).toEqual({ width: 800, height: 600 });
    });

    it("correctly parses valid JPEG SOF0 dimensions", () => {
      const jpegHeader = Buffer.alloc(30);
      jpegHeader.writeUInt8(0xff, 0);
      jpegHeader.writeUInt8(0xd8, 1); // SOI marker
      // Segment 1 (e.g. APP0)
      jpegHeader.writeUInt8(0xff, 2);
      jpegHeader.writeUInt8(0xe0, 3);
      jpegHeader.writeUInt16BE(16, 4); // segment length is 16 bytes
      // Segment 2: SOF0 at offset 2 + 2 + 16 = 20
      jpegHeader.writeUInt8(0xff, 20);
      jpegHeader.writeUInt8(0xc0, 21); // SOF0
      jpegHeader.writeUInt16BE(15, 22); // length
      jpegHeader.writeUInt8(8, 24); // precision
      jpegHeader.writeUInt16BE(450, 25); // height
      jpegHeader.writeUInt16BE(650, 27); // width

      const dims = getImageDimensions(jpegHeader);
      expect(dims).toEqual({ width: 650, height: 450 });
    });

    it("returns null for invalid/malformed image buffers", () => {
      const randomBuffer = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(getImageDimensions(randomBuffer)).toBeNull();
    });

    it("orchestrates the Cookidoo image upload flow and patches metadata correctly", async () => {
      const mockRequest = vi.spyOn(CookidooClient.prototype, "request");
      const mockSignature = vi.spyOn(CookidooClient.prototype, "requestImageSignature");
      const mockCloudinary = vi.spyOn(CookidooClient.prototype, "uploadImageToCloudinary");

      // Mock signature call
      mockSignature.mockResolvedValueOnce({ signature: "test-sig-123" });

      // Mock Cloudinary upload
      mockCloudinary.mockResolvedValueOnce({
        public_id: "prod/img/customer-recipe/uploaded-test-image",
        format: "png",
      });

      // Mock client request calls (POST copy, PATCH metadata, PATCH instructions)
      mockRequest.mockResolvedValueOnce({ recipeId: "draft-recipe-id-999" });
      mockRequest.mockResolvedValueOnce({ success: true });
      mockRequest.mockResolvedValueOnce({ success: true });

      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const pngHeader = Buffer.alloc(24);
      pngHeader.writeUInt8(0x89, 0);
      pngHeader.writeUInt8(0x50, 1);
      pngHeader.writeUInt8(0x4e, 2);
      pngHeader.writeUInt8(0x47, 3);
      pngHeader.writeUInt8(0x0d, 4);
      pngHeader.writeUInt8(0x0a, 5);
      pngHeader.writeUInt8(0x1a, 6);
      pngHeader.writeUInt8(0x0a, 7);
      pngHeader.writeUInt32BE(800, 16); // width
      pngHeader.writeUInt32BE(600, 20); // height

      const mockImageProvider = {
        getImage: vi.fn().mockResolvedValue({
          bytes: pngHeader,
          source: "mock-url",
          sourceUrl: "https://example.com/mock.png",
          contentType: "image/png",
        }),
      };

      const result = await adapter.upload({
        payload: adapter.createPayload(sampleInput),
        recipeInput: sampleInput,
        page: {
          url: "https://example.com/recipe",
          finalUrl: "https://example.com/recipe",
          title: "Test Recipe",
          markdown: "",
          html: "",
          images: [],
        },
        locale: "de-DE",
        cookie: "_oauth2_proxy=foo; v-authenticated=bar; v-is-authenticated=true",
        logger,
        imageProvider: mockImageProvider,
      });

      // Verify dimensions calculations: PNG 800x600 -> Centered square of 600x600 starting at X=100, Y=0
      expect(mockSignature).toHaveBeenCalledWith(
        expect.objectContaining({
          customCoordinates: "100,0,600,600",
          source: "uw",
        })
      );

      expect(mockCloudinary).toHaveBeenCalledWith(
        expect.objectContaining({
          customCoordinates: "100,0,600,600",
          source: "uw",
          signature: "test-sig-123",
          mimeType: "image/png",
        })
      );

      // Verify metadata patch has the image property
      const patchCall = mockRequest.mock.calls.find((call: any) => call[0]?.method === "PATCH" && call[0]?.body?.name);
      expect(patchCall).toBeDefined();
      expect(patchCall![0].body).toEqual(
        expect.objectContaining({
          image: "prod/img/customer-recipe/uploaded-test-image.png",
          isImageOwnedByUser: false,
        })
      );

      expect(result.uploadedImage).toEqual({
        public_id: "prod/img/customer-recipe/uploaded-test-image",
        format: "png",
      });
      expect(result.recipeUrl).toBe("https://cookidoo.de/created-recipes/de-DE/draft-recipe-id-999");
    });

    it("extracts nested image signatures and signs the Cloudinary upload preset", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { signature: "nested-sig-123" } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      ) as unknown as typeof fetch;
      const client = new CookidooClient({
        cookie: "_oauth2_proxy=foo",
        locale: "de-DE",
        fetch: fetchImpl,
      });

      const result = await client.requestImageSignature({
        timestamp: 1234567890,
        source: "uw",
        customCoordinates: "0,0,1024,1024",
      });

      expect(result.signature).toBe("nested-sig-123");
      const [, init] = (fetchImpl as any).mock.calls[0];
      expect(JSON.parse(init.body)).toEqual(
        expect.objectContaining({
          custom_coordinates: "0,0,1024,1024",
          source: "uw",
          timestamp: 1234567890,
          upload_preset: "prod-customer-recipe-signed",
        })
      );
    });

    it("treats Cookidoo login HTML responses as an expired session", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response("<!DOCTYPE html><html><title>Melde dich auf Cookidoo® an</title><body><form action=\"/login-srv/login\"><input name=\"password\"></form></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      ) as unknown as typeof fetch;
      const client = new CookidooClient({
        cookie: "_oauth2_proxy=expired",
        locale: "de-DE",
        fetch: fetchImpl,
      });

      await expect(client.requestImageSignature({
        timestamp: 1234567890,
        source: "uw",
        customCoordinates: "0,0,1024,1024",
      })).rejects.toThrow(CookidooAuthError);
    });
  });

  describe("Cookidoo browserless OAuth login", () => {
    it("follows the redirect flow, posts credentials, and returns Cookidoo session cookies", async () => {
      const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        const method = init?.method ?? "GET";

        if (href === "https://cookidoo.de/profile/de-DE/login?redirectAfterLogin=%2Ffoundation%2Fde-DE%2Ffor-you") {
          return redirectResponse("https://cookidoo.de/oauth2/start?market=de&ui_locales=de-DE&rd=%2Ffoundation%2Fde-DE%2Ffor-you");
        }
        if (href.startsWith("https://cookidoo.de/oauth2/start")) {
          return redirectResponse("https://ciam.prod.cookidoo.vorwerk-digital.com/authz-srv/authz?client_id=tmde2-live-v1&state=state-123");
        }
        if (href.startsWith("https://ciam.prod.cookidoo.vorwerk-digital.com/authz-srv/authz")) {
          return redirectResponse("https://eu.login.vorwerk.com/ciam/login?requestId=request-from-url&view_type=login");
        }
        if (href.startsWith("https://eu.login.vorwerk.com/ciam/login")) {
          return new Response('<form><input type="hidden" name="requestId" value="request-123"></form>', {
            status: 200,
            headers: { "content-type": "text/html" },
          });
        }
        if (href === "https://ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login" && method === "POST") {
          return redirectResponse("https://cookidoo.de/oauth2/callback?code=auth-code&state=state-123", {
            "set-cookie": "cidaas_sid=sid; Domain=ciam.prod.cookidoo.vorwerk-digital.com; Path=/",
          });
        }
        if (href.startsWith("https://cookidoo.de/oauth2/callback")) {
          return redirectResponse("/foundation/de-DE/for-you", {
            "set-cookie": "_oauth2_proxy=session; Domain=cookidoo.de; Path=/, v-authenticated=sig; Domain=cookidoo.de; Path=/, v-is-authenticated=true; Domain=cookidoo.de; Path=/",
          });
        }
        if (href === "https://cookidoo.de/foundation/de-DE/for-you") {
          return new Response("ok", { status: 200 });
        }

        throw new Error(`Unexpected request: ${method} ${href}`);
      }) as unknown as typeof fetch;

      const result = await passwordLoginForCookidoo({
        locale: "de-DE",
        credentials: {
          email: "cook@example.test",
          password: "secret",
        },
        fetch: fetchImpl,
      });

      expect(result).toEqual({
        cookie: "_oauth2_proxy=session; v-authenticated=sig; v-is-authenticated=true",
        source: "cookidoo-password",
        cookieNames: ["_oauth2_proxy", "cidaas_sid", "v-authenticated", "v-is-authenticated"],
      });

      const [, postInit] = (fetchImpl as any).mock.calls.find(([url, init]: [string, RequestInit]) =>
        String(url) === "https://ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login" && init?.method === "POST"
      );
      expect(String(postInit.body)).toBe("requestId=request-123&username=cook%40example.test&password=secret");
      expect(new Headers(postInit.headers).get("Referer")).toBe("https://eu.login.vorwerk.com/ciam/login?requestId=request-from-url&view_type=login");
    });
  });
});

function redirectResponse(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      ...headers,
    },
  });
}
