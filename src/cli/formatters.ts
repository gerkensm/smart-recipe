export function formatUserForTerminal(device: "mc" | "tm", user: any): string {
  const parts: string[] = [];
  const boldMagenta = "\x1b[1m\x1b[95m";
  const boldCyan = "\x1b[1m\x1b[36m";
  const reset = "\x1b[0m";
  const gray = "\x1b[90m";
  const boldYellow = "\x1b[1m\x1b[93m";

  const title = "User Session Profile";
  const line = "─".repeat(title.length + 4);
  parts.push("");
  parts.push(`  ${gray}┌${line}┐${reset}`);
  parts.push(`  ${gray}│  ${reset}${boldMagenta}${title}${reset}${gray}  │${reset}`);
  parts.push(`  ${gray}└${line}┘${reset}`);
  parts.push("");

  const devName = device === "tm" ? "Thermomix (Cookidoo)" : "Monsieur Cuisine";
  let name = "N/A";
  let email = "N/A";
  let locale = "de-DE";

  if (device === "tm") {
    const userInfo = user.userInfo ?? {};
    name = `${user.givenName ?? ""} ${user.lastName ?? ""}`.trim() || userInfo.username || "N/A";
    email = user.email || "N/A";
    locale = user.locale || "de-DE";
  } else {
    name = user.displayName || user.nickname || user.username || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "N/A";
    email = user.email || "N/A";
    locale = user.languageLocale || "de-DE";
  }

  parts.push(`  Device:     ${boldCyan}${devName}${reset}`);
  if (user.id) parts.push(`  ID:         ${boldCyan}${user.id}${reset}`);
  parts.push(`  Name:       ${boldCyan}${name}${reset}`);
  parts.push(`  Email:      ${boldCyan}${email}${reset}`);
  parts.push(`  Locale:     ${boldCyan}${locale}${reset}`);

  if (device === "tm") {
    const userInfo = user.userInfo ?? {};
    parts.push(`  Public:     ${boldCyan}${formatBoolean(user.isPublic)}${reset}`);
    if (userInfo.picture) parts.push(`  Picture:    ${boldCyan}${userInfo.picture}${reset}`);
    if (userInfo.pictureTemplate) parts.push(`  PictureTpl: ${boldCyan}${userInfo.pictureTemplate}${reset}`);

    const savedSearches = Array.isArray(user.savedSearches) ? user.savedSearches : [];
    parts.push("");
    parts.push(`  ${boldYellow}Saved Searches${reset}`);
    if (savedSearches.length === 0) {
      parts.push(`    ${gray}None${reset}`);
    } else {
      savedSearches.forEach((savedSearch: any, index: number) => {
        const search = savedSearch.search ?? {};
        parts.push(`    ${index + 1}. ${boldCyan}${savedSearch.id ?? "unnamed"}${reset}`);
        parts.push(`       Countries:    ${formatList(search.countries)}`);
        parts.push(`       Languages:    ${formatList(search.languages)}`);
        parts.push(`       Accessories:  ${formatAccessoryList(search.accessories)}`);
      });
    }

    parts.push("");
    parts.push(`  ${boldYellow}Food Preferences${reset}`);
    parts.push(`    ${formatList(user.foodPreferences)}`);

    parts.push("");
    parts.push(`  ${boldYellow}Thermomixes${reset}`);
    const thermomixes = Array.isArray(user.thermomixes) ? user.thermomixes : [];
    if (thermomixes.length === 0) {
      parts.push(`    ${gray}None registered in profile response${reset}`);
    } else {
      thermomixes.forEach((tm: any, index: number) => {
        parts.push(`    ${index + 1}. ${formatObjectSummary(tm)}`);
      });
    }

    if (user.meta && Object.keys(user.meta).length > 0) {
      parts.push("");
      parts.push(`  ${boldYellow}Meta${reset}`);
      Object.entries(user.meta).forEach(([key, value]) => {
        parts.push(`    ${key}: ${formatScalar(value)}`);
      });
    }
  }

  parts.push("");

  return parts.join("\n");
}

export function formatRecipesForTerminal(device: "mc" | "tm", result: any): string {
  const parts: string[] = [];
  const boldMagenta = "\x1b[1m\x1b[95m";
  const boldCyan = "\x1b[1m\x1b[36m";
  const boldGreen = "\x1b[1m\x1b[92m";
  const boldYellow = "\x1b[1m\x1b[93m";
  const reset = "\x1b[0m";
  const gray = "\x1b[90m";

  const recipes = Array.isArray(result.recipes) ? result.recipes : [];
  const count = recipes.length;
  const total = result.total ?? count;
  const title = `Recipes (${count} shown${total !== count ? ` of ${total}` : ""})`;
  const line = "─".repeat(title.length + 4);
  parts.push("");
  parts.push(`  ${gray}┌${line}┐${reset}`);
  parts.push(`  ${gray}│  ${reset}${boldMagenta}${title}${reset}${gray}  │${reset}`);
  parts.push(`  ${gray}└${line}┘${reset}`);
  parts.push("");

  if (count === 0) {
    parts.push(`  ${boldYellow}No recipes found on this device.${reset}`);
    parts.push(`  ${gray}Try: smart-recipe doctor --device ${device}${reset}`);
    parts.push("");
    return parts.join("\n");
  }

  recipes.forEach((recipe: any, idx: number) => {
    parts.push(`  ${boldGreen}[${idx + 1}]${reset}  ${boldCyan}${recipe.title || "Untitled"}${reset} (${recipe.status || "unknown"})`);
    parts.push(`       ID:  ${recipe.id}`);
    if (recipe.recipeUrl) {
      parts.push(`       URL: ${recipe.recipeUrl}`);
    }
    const facts = [
      recipe.updatedAt ? `updated ${String(recipe.updatedAt).slice(0, 10)}` : undefined,
      recipe.deviceTypes?.length ? `tools ${recipe.deviceTypes.join(", ")}` : undefined,
      typeof recipe.ingredientCount === "number" ? `${recipe.ingredientCount} ingredients` : undefined,
      typeof recipe.stepCount === "number" ? `${recipe.stepCount} steps` : undefined,
      recipe.hasImage === true ? "image" : undefined,
      recipe.hasHints === true ? "hints" : undefined
    ].filter(Boolean);
    if (facts.length > 0) parts.push(`       ${facts.join(" · ")}`);
    parts.push("");
  });

  return parts.join("\n");
}

export const formatDraftsForTerminal = formatRecipesForTerminal;

export function formatDoctorForTerminal(report: any): string {
  const parts: string[] = [];
  const boldMagenta = "\x1b[1m\x1b[95m";
  const boldCyan = "\x1b[1m\x1b[36m";
  const boldGreen = "\x1b[1m\x1b[92m";
  const boldYellow = "\x1b[1m\x1b[93m";
  const reset = "\x1b[0m";
  const gray = "\x1b[90m";

  const title = "Smart Recipe Doctor";
  const line = "─".repeat(title.length + 4);
  parts.push("");
  parts.push(`  ${gray}┌${line}┐${reset}`);
  parts.push(`  ${gray}│  ${reset}${boldMagenta}${title}${reset}${gray}  │${reset}`);
  parts.push(`  ${gray}└${line}┘${reset}`);
  parts.push("");
  parts.push(`  Device:      ${boldCyan}${report.deviceName}${reset}`);
  parts.push(`  Config:      ${report.configPath}`);
  parts.push(`  Local .env:  ${report.localEnvPath}`);
  parts.push(`  OpenAI key:  ${report.openAiKeyPresent ? `${boldGreen}present${reset}` : `${boldYellow}missing${reset}`}`);
  parts.push(`  Cookie:      ${report.cookie.present ? `${boldGreen}present${reset}` : `${boldYellow}missing${reset}`} (${report.cookie.key})`);
  if (report.tm) {
    parts.push(`  TM locale:   ${report.tm.locale}`);
    parts.push(`  TM version:  ${report.tm.version}`);
  }
  if (report.mc) {
    parts.push(`  MC cutter:   ${formatBoolean(report.mc.foodProcessor)}`);
  }
  parts.push("");
  parts.push(`  Auth check:  ${formatAuthStatus(report.auth)}`);
  if (report.recommendations?.length) {
    parts.push("");
    parts.push(`  ${boldYellow}Next Steps${reset}`);
    report.recommendations.forEach((recommendation: string) => {
      parts.push(`    - ${recommendation}`);
    });
  }
  parts.push("");
  return parts.join("\n");
}

function formatAuthStatus(auth: any): string {
  if (!auth?.checked) return "not checked";
  if (auth.ok) return "ok";
  return `failed (${auth.message || "unknown error"})`;
}

function formatBoolean(value: unknown): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "N/A";
}

function formatList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "None";
  return value.map(formatScalar).join(", ");
}

function formatAccessoryList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "None";
  return value.map((accessory) => {
    const raw = String(accessory);
    const label = TM_ACCESSORY_LABELS[raw];
    return label ? `${label} (${raw})` : raw;
  }).join(", ");
}

function formatObjectSummary(value: unknown): string {
  if (!value || typeof value !== "object") return formatScalar(value);
  return Object.entries(value as Record<string, unknown>)
    .map(([key, entryValue]) => `${key}: ${formatScalar(entryValue)}`)
    .join(", ");
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined || value === "") return "N/A";
  if (Array.isArray(value)) return formatList(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const TM_ACCESSORY_LABELS: Record<string, string> = {
  includingFriend: "Thermomix Friend",
  includingBladeCover: "Blade Cover",
  includingBladeCoverWithPeeler: "Blade Cover with Peeler",
  includingCutter: "Thermomix Cutter",
  includingCutterPlus: "Thermomix Cutter+",
  includingSensor: "Thermomix Sensor",
};
