import Type, { type Static } from "typebox";

const SteamingSpeedSchema = Type.Union([
  Type.Literal("soft"),
  Type.Literal("1"),
  Type.Literal("1.5"),
  Type.Literal("2"),
  Type.Literal("2.5"),
  Type.Literal("3"),
  Type.Literal("3.5"),
  Type.Literal("4"),
  Type.Literal("4.5"),
  Type.Literal("5"),
]);

const BlendSpeedSchema = Type.Union([
  Type.Literal("6"),
  Type.Literal("6.5"),
  Type.Literal("7"),
  Type.Literal("7.5"),
  Type.Literal("8"),
]);

const WarmUpSpeedSchema = Type.Union([
  Type.Literal("soft"),
  Type.Literal("1"),
  Type.Literal("2"),
]);

const BrowningTempSchema = Type.Union([
  Type.Literal(140),
  Type.Literal(145),
  Type.Literal(150),
  Type.Literal(155),
  Type.Literal(160),
]);

// Discriminated union of TM-compatible modes
export const CookidooStepModeSchema = Type.Union([
  Type.Object({
    type: Type.Literal("dough"),
    time: Type.Integer({ minimum: 1, description: "Dough kneading time in seconds." }),
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("blend"),
    time: Type.Optional(Type.Integer({ minimum: 1, description: "Blending time in seconds." })),
    speed: BlendSpeedSchema,
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("turbo"),
    time: Type.Integer({ minimum: 1, description: "Turbo duration in seconds." }),
    pulseCount: Type.Optional(Type.Integer({ minimum: 1, description: "Pulse count." })),
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("warmUp"),
    temperature: Type.Integer({ minimum: 37, maximum: 100, description: "Target warming temperature in Celsius." }),
    speed: WarmUpSpeedSchema,
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("riceCooker"),
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("steaming"),
    time: Type.Integer({ minimum: 1, description: "Steaming time in seconds." }),
    speed: SteamingSpeedSchema,
    direction: Type.Optional(Type.Union([Type.Literal("CW"), Type.Literal("CCW")])),
    accessory: Type.Optional(Type.Literal("Varoma")),
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("browning"),
    time: Type.Integer({ minimum: 1, description: "Browning time in seconds." }),
    temperature: BrowningTempSchema,
    power: Type.Optional(Type.Literal("Gentle")),
  }, { additionalProperties: false }),
], { description: "TM-specific guided modes." });

export const CookidooModeAnnotationSchema = Type.Object({
  matchedSubstring: Type.String({
    minLength: 1,
    description: "The exact substring inside the step text that refers to this mode. Example: 'steam 20 min/Varoma/speed 1'. MUST be an exact match.",
  }),
  mode: CookidooStepModeSchema,
}, { additionalProperties: false });

export const CookidooStepSchema = Type.Object({
  text: Type.String({
    minLength: 1,
    maxLength: 1000,
    description: "Step instruction text. Use clear, continuous phrasing. Embedded mode instructions must match matchedSubstring exactly.",
  }),
  modeAnnotations: Type.Optional(Type.Array(CookidooModeAnnotationSchema, {
    description: "Mode annotations parsed from substrings inside the step text.",
  })),
}, { additionalProperties: false });

export const CookidooRecipeInputSchema = Type.Object({
  title: Type.String({
    minLength: 1,
    maxLength: 120,
    description: "Recipe title in the target locale. Keep it concise.",
  }),
  prepTime: Type.Integer({
    minimum: 1,
    description: "Hands-on preparation time in minutes.",
  }),
  totalTime: Type.Integer({
    minimum: 1,
    description: "Total time in minutes.",
  }),
  servingSize: Type.Integer({
    minimum: 1,
    maximum: 24,
    description: "Number of servings.",
  }),
  servingUnitText: Type.String({
    minLength: 1,
    maxLength: 40,
    description: "Serving unit (e.g. portion, pieces, servings).",
  }),
  ingredients: Type.Array(Type.String(), {
    minItems: 1,
    description: "Flat list of ingredient texts.",
  }),
  steps: Type.Array(CookidooStepSchema, {
    minItems: 1,
  }),
  settings: Type.Object({
    locale: Type.String({ description: "Target locale, e.g. de-DE, fr-FR." }),
  }, { additionalProperties: false }),
}, {
  $id: "https://github.com/smart-recipe/smart-recipe/schemas/cookidoo-recipe-input.json",
  additionalProperties: false,
  description: "Model-friendly recipe input for Thermomix Cookidoo.",
});

export type CookidooRecipeInput = Static<typeof CookidooRecipeInputSchema>;
