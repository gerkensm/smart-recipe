import Type, { type Static } from "typebox";

const SteamingSpeedSchema = Type.Union([
  Type.Literal("soft"),
  Type.Literal("0.5"),
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

// Pürieren: high-speed blending/pureeing only — speed 6–8 as shown in Cookidoo editor
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

// Cooking speeds for simmering/heating steps (soft through 5, same range as steaming)
const CookingSpeedSchema = Type.Union([
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

// Discrete temperature steps as shown in Cookidoo editor (37–90°C)
const WarmUpTempSchema = Type.Union([
  Type.Literal(37),
  Type.Literal(40),
  Type.Literal(45),
  Type.Literal(50),
  Type.Literal(55),
  Type.Literal(60),
  Type.Literal(65),
  Type.Literal(70),
  Type.Literal(75),
  Type.Literal(80),
  Type.Literal(85),
  Type.Literal(90),
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
    time: Type.Integer({ minimum: 1, maximum: 1200, description: "Dough kneading time in seconds. Min 1s, max 20 min (1200s)." }),
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("blend"),
    time: Type.Integer({ minimum: 10, maximum: 300, description: "Blending time in seconds. Min 10s, max 5 min (300s). Cookidoo silently rounds up anything shorter than 10s." }),
    speed: BlendSpeedSchema,
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("turbo"),
    // pulseDuration: exactly 0.5, 1, or 2 seconds per pulse (as shown in Cookidoo editor)
    pulseDuration: Type.Union([
      Type.Literal(0.5),
      Type.Literal(1),
      Type.Literal(2),
    ], { description: "Duration of each turbo pulse: 0.5, 1, or 2 seconds." }),
    pulseCount: Type.Optional(Type.Integer({ minimum: 1, maximum: 9, description: "Number of pulses (1–9x)." })),
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("warmUp"),
    temperature: WarmUpTempSchema,
    speed: WarmUpSpeedSchema,
  }, { additionalProperties: false }),

  // General cooking/simmering: temperature 37-120°C, with time, speed, and optional direction.
  // Use for steps like "25 Min./100°C/Linkslauf/Stufe 1 garen" (time + temp + speed + direction).
  Type.Object({
    type: Type.Literal("cook"),
    time: Type.Integer({ minimum: 1, description: "Cooking time in seconds." }),
    temperature: Type.Integer({ minimum: 37, maximum: 120, description: "Cooking temperature in Celsius." }),
    speed: CookingSpeedSchema,
    direction: Type.Optional(Type.Union([Type.Literal("CW"), Type.Literal("CCW")], { description: "CW = Rechtslauf (default), CCW = Linkslauf (reverse, gentle for soups/stews)." })),
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("riceCooker"),
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("steaming"),
    time: Type.Integer({ minimum: 1, maximum: 5940, description: "Steaming time in seconds. Min 1s, max 99 min (5940s)." }),
    speed: SteamingSpeedSchema,
    direction: Type.Optional(Type.Union([Type.Literal("CW"), Type.Literal("CCW")])),
    // Accessory placement: Varoma (top), Gareinsatz (basket inside bowl), both
    accessory: Type.Optional(Type.Union([
      Type.Literal("Varoma"),
      Type.Literal("Gareinsatz"),
      Type.Literal("both"),
    ])),
  }, { additionalProperties: false }),

  Type.Object({
    type: Type.Literal("browning"),
    time: Type.Integer({ minimum: 1, maximum: 1800, description: "Browning time in seconds. Min 1s, max 30 min (1800s)." }),
    temperature: BrowningTempSchema,
    // power: Gentle (Leicht) or Intensive (Intensiv) as shown in Cookidoo editor
    power: Type.Optional(Type.Union([Type.Literal("Gentle"), Type.Literal("Intensive")])),
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
  hints: Type.String({
    maxLength: 4500,
    description: "Optional tips, notes, or serving suggestions from the source recipe. Use an empty string if there are none. Do NOT copy tips that are specific to equipment or techniques not relevant to Thermomix.",
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
