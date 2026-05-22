import type { RecipeInput } from "./schema.js";
import { localeComplexityIds } from "../catalogs/catalogs.js";

const ansi = {
  reset: "\x1b[0m\x1b[24m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  
  // Colors
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  
  // Bright Colors
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m"
};

interface LocaleTranslation {
  speed: string;
  prepTime: string;
  readyIn: string;
  servings: string;
  complexity: string;
  optional: string;
  ingredients: string;
  steps: string;
  nutrients: {
    calories: string;
    carbohydrate: string;
    fat: string;
    protein: string;
  };
  complexityLevels: {
    easy: string;
    medium: string;
    hard: string;
  };
  rotation: {
    left: string;
    right: string;
  };
  modes: {
    manualCooking: string;
    turbo: string;
    scale: string;
    roast: string;
    solidDoughKnead: string;
    softDoughKnead: string;
    liquidDoughKnead: string;
    steam: string;
    sousVide: string;
    slowCooking: string;
    cookingEggs: string;
    precleaning: string;
    fermentation: string;
    riceCooking: string;
    foodProcessor: string;
    puree: string;
    smoothie: string;
  };
  timeUnits: {
    hour: string;
    minute: string;
    second: string;
  };
  eggSizes: Record<string, string>;
  eggTextures: Record<string, string>;
  cleanDurations: Record<string, string>;
}

const translations: Record<string, LocaleTranslation> = {
  "de-DE": {
    speed: "Stufe",
    prepTime: "Vorbereitung",
    readyIn: "Bereit in",
    servings: "Portionen",
    complexity: "Schwierigkeit",
    optional: "optional",
    ingredients: "Zutaten:",
    steps: "Schritte:",
    nutrients: {
      calories: "Kalorien",
      carbohydrate: "Kohlenhydrate",
      fat: "Fett",
      protein: "Eiweiß"
    },
    complexityLevels: { easy: "Einfach", medium: "Mittel", hard: "Schwer" },
    rotation: { left: "Rühren (Linkslauf)", right: "Zerkleinern (Rechtslauf)" },
    modes: {
      manualCooking: "Manuelles Kochen",
      turbo: "Turbo",
      scale: "Wiegen",
      roast: "Anbraten",
      solidDoughKnead: "Teig kneten (fest)",
      softDoughKnead: "Teig kneten (weich)",
      liquidDoughKnead: "Teig kneten (flüssig)",
      steam: "Dampfgaren",
      sousVide: "Sous-Vide",
      slowCooking: "Slow Cooking",
      cookingEggs: "Eierkochen",
      precleaning: "Vorspülen",
      fermentation: "Fermentieren",
      riceCooking: "Reiskochen",
      foodProcessor: "Food Processor",
      puree: "Pürieren",
      smoothie: "Smoothie"
    },
    timeUnits: { hour: "Std.", minute: "Min.", second: "Sek." },
    eggSizes: { small: "S", medium: "M", large: "L" },
    eggTextures: { soft: "weich", waxy_soft: "wachsweich", hard: "hart" },
    cleanDurations: { short: "kurz", long: "lang" }
  },
  "en-US": {
    speed: "Speed",
    prepTime: "Preparation",
    readyIn: "Ready in",
    servings: "Servings",
    complexity: "Complexity",
    optional: "optional",
    ingredients: "Ingredients:",
    steps: "Steps:",
    nutrients: {
      calories: "Calories",
      carbohydrate: "Carbs",
      fat: "Fat",
      protein: "Protein"
    },
    complexityLevels: { easy: "Easy", medium: "Medium", hard: "Hard" },
    rotation: { left: "Stir (Reverse)", right: "Chop (Forward)" },
    modes: {
      manualCooking: "Manual Cooking",
      turbo: "Turbo",
      scale: "Scale",
      roast: "Roast",
      solidDoughKnead: "Knead (Solid)",
      softDoughKnead: "Knead (Soft)",
      liquidDoughKnead: "Knead (Liquid)",
      steam: "Steam",
      sousVide: "Sous-Vide",
      slowCooking: "Slow Cooking",
      cookingEggs: "Eggs",
      precleaning: "Precleaning",
      fermentation: "Fermentation",
      riceCooking: "Rice Cooking",
      foodProcessor: "Food Processor",
      puree: "Puree",
      smoothie: "Smoothie"
    },
    timeUnits: { hour: "h", minute: "m", second: "s" },
    eggSizes: { small: "small", medium: "medium", large: "large" },
    eggTextures: { soft: "soft", waxy_soft: "medium/soft-boiled", hard: "hard" },
    cleanDurations: { short: "short", long: "long" }
  },
  "fr-FR": {
    speed: "Vitesse",
    prepTime: "Préparation",
    readyIn: "Prêt en",
    servings: "Portions",
    complexity: "Difficulté",
    optional: "facultatif",
    ingredients: "Ingrédients :",
    steps: "Étapes :",
    nutrients: {
      calories: "Calories",
      carbohydrate: "Glucides",
      fat: "Lipides",
      protein: "Protéines"
    },
    complexityLevels: { easy: "Facile", medium: "Moyen", hard: "Difficile" },
    rotation: { left: "Mélanger (sens inverse)", right: "Hacher (sens normal)" },
    modes: {
      manualCooking: "Cuisson Manuelle",
      turbo: "Turbo",
      scale: "Pesée",
      roast: "Saisir",
      solidDoughKnead: "Pétrir (pâte ferme)",
      softDoughKnead: "Pétrir (pâte souple)",
      liquidDoughKnead: "Pétrir (pâte liquide)",
      steam: "Cuisson Vapeur",
      sousVide: "Sous-Vide",
      slowCooking: "Mijotage",
      cookingEggs: "Cuisson œufs",
      precleaning: "Prélavage",
      fermentation: "Fermentation",
      riceCooking: "Cuisson riz",
      foodProcessor: "Robot Culinaire",
      puree: "Purée",
      smoothie: "Smoothie"
    },
    timeUnits: { hour: "h", minute: "min", second: "s" },
    eggSizes: { small: "petit", medium: "moyen", large: "grand" },
    eggTextures: { soft: "mollet", waxy_soft: "mi-cuit", hard: "dur" },
    cleanDurations: { short: "court", long: "long" }
  },
  "it-IT": {
    speed: "Velocità",
    prepTime: "Preparazione",
    readyIn: "Pronto in",
    servings: "Porzioni",
    complexity: "Difficoltà",
    optional: "opzionale",
    ingredients: "Ingredienti:",
    steps: "Passaggi:",
    nutrients: {
      calories: "Calorie",
      carbohydrate: "Carboidrati",
      fat: "Grassi",
      protein: "Proteine"
    },
    complexityLevels: { easy: "Facile", medium: "Medio", hard: "Difficile" },
    rotation: { left: "Mescolare (antiorario)", right: "Tritare (orario)" },
    modes: {
      manualCooking: "Cottura Manuale",
      turbo: "Turbo",
      scale: "Bilancia",
      roast: "Rosolare",
      solidDoughKnead: "Impastare (solido)",
      softDoughKnead: "Impastare (morbido)",
      liquidDoughKnead: "Impastare (liquido)",
      steam: "Vapore",
      sousVide: "Sous-Vide",
      slowCooking: "Cottura lenta",
      cookingEggs: "Cuocere uova",
      precleaning: "Prelavaggio",
      fermentation: "Fermentazione",
      riceCooking: "Cuocere riso",
      foodProcessor: "Robot da cucina",
      puree: "Frullare",
      smoothie: "Smoothie"
    },
    timeUnits: { hour: "h", minute: "min", second: "s" },
    eggSizes: { small: "piccolo", medium: "medio", large: "grande" },
    eggTextures: { soft: "alla coque", waxy_soft: "barzotto", hard: "sodo" },
    cleanDurations: { short: "breve", long: "lungo" }
  },
  "pl-PL": {
    speed: "Prędkość",
    prepTime: "Przygotowanie",
    readyIn: "Gotowe w",
    servings: "Porcje",
    complexity: "Trudność",
    optional: "opcjonalnie",
    ingredients: "Składniki:",
    steps: "Kroki:",
    nutrients: {
      calories: "Kalorie",
      carbohydrate: "Węglowodany",
      fat: "Tłuszcze",
      protein: "Białko"
    },
    complexityLevels: { easy: "Łatwe", medium: "Średnie", hard: "Trudne" },
    rotation: { left: "Mieszanie (wsteczne)", right: "Siekane (w prawo)" },
    modes: {
      manualCooking: "Gotowanie ręczne",
      turbo: "Turbo",
      scale: "Waga",
      roast: "Przypiekanie",
      solidDoughKnead: "Zagniatanie (twarde)",
      softDoughKnead: "Zagniatanie (miękkie)",
      liquidDoughKnead: "Zagniatanie (płynne)",
      steam: "Parowanie",
      sousVide: "Sous-vide",
      slowCooking: "Wolne gotowanie",
      cookingEggs: "Gotowanie jajek",
      precleaning: "Mycie wstępne",
      fermentation: "Fermentacja",
      riceCooking: "Gotowanie ryżu",
      foodProcessor: "Malakser",
      puree: "Przecieranie",
      smoothie: "Smoothie"
    },
    timeUnits: { hour: "godz", minute: "min", second: "sek" },
    eggSizes: { small: "małe", medium: "średnie", large: "duże" },
    eggTextures: { soft: "na miękko", waxy_soft: "półmiękko", hard: "na twardo" },
    cleanDurations: { short: "krótkie", long: "długie" }
  },
  "cs-CZ": {
    speed: "Rychlost",
    prepTime: "Příprava",
    readyIn: "Hotovo za",
    servings: "Porce",
    complexity: "Obtížnost",
    optional: "volitelné",
    ingredients: "Suroviny:",
    steps: "Postup:",
    nutrients: {
      calories: "Kalorie",
      carbohydrate: "Sacharidy",
      fat: "Tuky",
      protein: "Bílkoviny"
    },
    complexityLevels: { easy: "Snadné", medium: "Střední", hard: "Obtížné" },
    rotation: { left: "Míchání (zpětný chod)", right: "Sekání (pravý chod)" },
    modes: {
      manualCooking: "Ruční vaření",
      turbo: "Turbo",
      scale: "Váha",
      roast: "Restování",
      solidDoughKnead: "Hnětení (tuhé těsto)",
      softDoughKnead: "Hnětení (měkké těsto)",
      liquidDoughKnead: "Hnětení (tekuté těsto)",
      steam: "Vaření v páře",
      sousVide: "Sous-vide",
      slowCooking: "Pomalé vaření",
      cookingEggs: "Vaření vajec",
      precleaning: "Předmytí",
      fermentation: "Fermentace",
      riceCooking: "Vaření rýže",
      foodProcessor: "Kuchyňský robot",
      puree: "Pyré",
      smoothie: "Smoothie"
    },
    timeUnits: { hour: "hod", minute: "min", second: "sek" },
    eggSizes: { small: "malé", medium: "střední", large: "velké" },
    eggTextures: { soft: "nanaměkko", waxy_soft: "nahhniličku", hard: "natvrdo" },
    cleanDurations: { short: "krátký", long: "dlouhý" }
  }
};

function getTranslation(locale: string): LocaleTranslation {
  return translations[locale] || translations["en-US"];
}

function drawBox(text: string, titleColor: string = ansi.bold + ansi.brightMagenta): string {
  const line = "─".repeat(text.length + 4);
  return [
    `  ${ansi.gray}┌${line}┐${ansi.reset}`,
    `  ${ansi.gray}│  ${ansi.reset}${titleColor}${text}${ansi.reset}${ansi.gray}  │${ansi.reset}`,
    `  ${ansi.gray}└${line}┘${ansi.reset}`
  ].join("\n");
}

function formatDuration(minutes: number, seconds: number, t: LocaleTranslation): string {
  const parts: string[] = [];
  if (minutes > 0) parts.push(`${minutes}${t.timeUnits.minute}`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}${t.timeUnits.second}`);
  return parts.join(" ");
}

function formatMinutesOnly(totalMinutes: number, t: LocaleTranslation): string {
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}${t.timeUnits.hour} ${mins}${t.timeUnits.minute}` : `${hours}${t.timeUnits.hour}`;
  }
  return `${totalMinutes} ${t.timeUnits.minute}`;
}

export function formatRecipeTerminal(recipe: RecipeInput): string {
  const locale = recipe.settings?.locale ?? "de-DE";
  const t = getTranslation(locale);
  
  const parts: string[] = [];
  
  // Title box
  parts.push("");
  parts.push(drawBox(recipe.title));
  
  // Status tag & Description
  const statusStr = recipe.status ? ` [${recipe.status.toUpperCase()}]` : "";
  if (recipe.description) {
    const descLines = recipe.description.split("\n");
    descLines.forEach((line, i) => {
      if (line.trim() || i < descLines.length - 1) {
        const suffix = i === descLines.length - 1 ? statusStr : "";
        parts.push(`  ${ansi.italic}${ansi.gray}${line}${ansi.reset}${suffix}`);
      }
    });
    parts.push("");
  } else if (statusStr) {
    parts.push(`  ${ansi.gray}${statusStr}${ansi.reset}`);
    parts.push("");
  }

  // Key metrics row
  const complexityId = recipe.settings?.complexityId;
  let complexityLabel = t.complexityLevels.medium;
  const complexityMapping = localeComplexityIds[locale as keyof typeof localeComplexityIds];
  if (complexityMapping && complexityId !== undefined) {
    if (complexityId === complexityMapping.easy) complexityLabel = t.complexityLevels.easy;
    else if (complexityId === complexityMapping.hard) complexityLabel = t.complexityLevels.hard;
    else if (complexityId === complexityMapping.medium) complexityLabel = t.complexityLevels.medium;
  }
  
  const metrics = [
    `👥 ${ansi.bold}${recipe.servingSize.amount} ${recipe.servingSize.unit}${ansi.reset}`,
    `🕒 ${t.prepTime}: ${ansi.bold}${formatMinutesOnly(recipe.servingSize.preparationTime, t)}${ansi.reset}`,
    `🏁 ${t.readyIn}: ${ansi.bold}${formatMinutesOnly(recipe.servingSize.readyInTime, t)}${ansi.reset}`,
    `📊 ${t.complexity}: ${ansi.bold}${complexityLabel}${ansi.reset}`
  ];
  parts.push("  " + metrics.join("   "));
  parts.push("");
  
  // Nutrients row
  if (recipe.nutrients && recipe.nutrients.length > 0) {
    const findNutrient = (name: string) => recipe.nutrients.find(n => n.name === name);
    const c = findNutrient("calories");
    const carb = findNutrient("carbohydrate");
    const f = findNutrient("fat");
    const p = findNutrient("protein");
    
    const nutrientParts: string[] = [];
    if (c) nutrientParts.push(`🔥 ${ansi.bold}${c.amount} kCal${ansi.reset}`);
    if (carb) nutrientParts.push(`🍞 ${ansi.bold}${carb.amount}g${ansi.reset} ${t.nutrients.carbohydrate}`);
    if (f) nutrientParts.push(`🥑 ${ansi.bold}${f.amount}g${ansi.reset} ${t.nutrients.fat}`);
    if (p) nutrientParts.push(`🥩 ${ansi.bold}${p.amount}g${ansi.reset} ${t.nutrients.protein}`);
    
    if (nutrientParts.length > 0) {
      parts.push("  " + nutrientParts.join("   "));
      parts.push("");
    }
  }
  
  // Ingredients list (Indented)
  parts.push(`  ${ansi.bold}${ansi.underline}${t.ingredients}${ansi.reset}`);
  parts.push("");
  for (const group of recipe.servingSize.ingredientGroups) {
    if (group.name && recipe.servingSize.ingredientGroups.length > 1) {
      parts.push(`    ${ansi.bold}🥣 ${group.name}${ansi.reset}`);
    }
    const ingredientIndent = group.name && recipe.servingSize.ingredientGroups.length > 1 ? "      " : "    ";
    for (const ing of group.ingredients) {
      const isOpt = ing.isOptional;
      const optStr = isOpt ? ` (${t.optional})` : "";
      const amtStr = ing.amount !== undefined && ing.amount !== "" ? `${ansi.brightCyan}${ing.amount}${ansi.reset}` : "";
      const unitStr = ing.unit ? ` ${ansi.cyan}${ing.unit}${ansi.reset}` : "";
      const leadingSpace = amtStr || unitStr ? " " : "";
      
      const line = `${ingredientIndent}• ${amtStr}${unitStr}${leadingSpace}${ing.name}${optStr}`;
      if (isOpt) {
        parts.push(`${ansi.gray}${line}${ansi.reset}`);
      } else {
        parts.push(line);
      }
    }
  }
  parts.push("");
  
  // Instruction Steps (Indented)
  parts.push(`  ${ansi.bold}${ansi.underline}${t.steps}${ansi.reset}`);
  parts.push("");
  recipe.servingSize.steps.forEach((step, idx) => {
    parts.push(`    ${ansi.bold}${ansi.brightGreen}${idx + 1}. ${step.title}${ansi.reset}`);
    
    // Mode parameters formatting
    const mode = step.mode;
    if (mode && mode.type !== "none") {
      const modeKey = mode.type as keyof typeof t.modes;
      const localizedModeName = t.modes[modeKey] || mode.type;
      
      const params: string[] = [];
      
      if (mode.type === "manualCooking") {
        const m = mode as any;
        const temp = m.temperature ?? 0;
        const tempStr = temp > 0 ? `${temp}°C` : "";
        if (tempStr) params.push(tempStr);
        
        params.push(formatDuration(m.minutes ?? 0, m.seconds ?? 0, t));
        params.push(`${t.speed} ${m.speed ?? 0}`);
        
        const rotationVal = m.rotationDirection ?? "right";
        params.push(rotationVal === "left" ? t.rotation.left : t.rotation.right);
      } else if (mode.type === "scale") {
        const m = mode as any;
        params.push(`${m.grams ?? 0} g`);
      } else if (mode.type === "roast") {
        const m = mode as any;
        params.push(`${m.temperature ?? 0}°C`);
        params.push(formatDuration(m.minutes ?? 0, m.seconds ?? 0, t));
      } else if (mode.type === "turbo") {
        const m = mode as any;
        params.push(`${m.seconds ?? 0}${t.timeUnits.second}`);
      } else if (["solidDoughKnead", "softDoughKnead", "liquidDoughKnead", "steam", "riceCooking", "foodProcessor", "puree", "smoothie"].includes(mode.type)) {
        const m = mode as any;
        params.push(formatDuration(m.minutes ?? 0, m.seconds ?? 0, t));
      } else if (mode.type === "sousVide" || mode.type === "slowCooking" || mode.type === "fermentation") {
        const m = mode as any;
        if (m.temperature !== undefined) params.push(`${m.temperature}°C`);
        params.push(formatDuration(m.minutes ?? 0, m.seconds ?? 0, t));
      } else if (mode.type === "cookingEggs") {
        const m = mode as any;
        const sizeStr = t.eggSizes[m.size] || m.size;
        const textureStr = t.eggTextures[m.texture] || m.texture;
        params.push(`${sizeStr}, ${textureStr}`);
      } else if (mode.type === "precleaning") {
        const m = mode as any;
        const durStr = t.cleanDurations[m.duration] || m.duration;
        params.push(durStr);
      }
      
      const badge = `${ansi.bold}${ansi.brightYellow}[${localizedModeName}${params.length > 0 ? ": " + params.join(", ") : ""}]${ansi.reset}`;
      parts.push(`      ${badge}`);
    }
    
    const descLines = step.description.split("\n");
    descLines.forEach((line) => {
      if (line.trim()) {
        parts.push(`      ${line}`);
      }
    });
    parts.push("");
  });
  
  return parts.join("\n");
}

