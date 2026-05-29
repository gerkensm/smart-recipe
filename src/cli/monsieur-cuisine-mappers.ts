export function mapMonsieurCuisineToInput(recipe: any): any {
  const serving = recipe.servingSizes?.[0] || recipe.servingSize || {};
  return {
    title: recipe.title || "Recipe",
    description: recipe.description || "",
    settings: {
      locale: recipe.languageLocale || "de-DE",
      complexityId: recipe.complexity?.id || 142
    },
    status: recipe.status,
    nutrients: recipe.nutrients,
    servingSize: {
      amount: serving.amount || 1,
      unit: serving.unit || "Portion",
      preparationTime: serving.preparationTime || 0,
      readyInTime: serving.readyInTime || 0,
      ingredientGroups: (serving.ingredientGroups || []).map((g: any) => ({
        name: g.name || "",
        ingredients: (g.ingredients || []).map((i: any) => ({
          name: i.name,
          amount: i.amount || "",
          unit: i.unit || "",
          isOptional: i.isOptional
        }))
      })),
      steps: (serving.steps || []).map((s: any) => {
        let mappedMode: any = { type: "none" };
        if (s.mode) {
          const type = s.mode.type;
          const settings = s.mode.deviceSettings?.[0] || {};
          const duration = settings.time || 0;
          const mins = Math.floor(duration / 60);
          const secs = duration % 60;

          if (type === "manualCooking" || type === "manual_cooking") {
            mappedMode = {
              type: "manualCooking",
              temperature: settings.temperature || 0,
              minutes: mins,
              seconds: secs,
              speed: settings.speed || 0,
              rotationDirection: settings.clockwise === false ? "left" : "right"
            };
          } else if (type === "turbo") {
            mappedMode = { type: "turbo", seconds: duration };
          } else if (type === "scale") {
            mappedMode = { type: "scale", grams: settings.weight || 0 };
          } else if (type === "roasting" || type === "roast") {
            mappedMode = {
              type: "roast",
              temperature: settings.temperature || 0,
              minutes: mins,
              seconds: secs
            };
          } else if (type === "solid_dough_knead" || type === "solidDoughKnead") {
            mappedMode = { type: "solidDoughKnead", minutes: mins, seconds: secs };
          } else if (type === "soft_dough_knead" || type === "softDoughKnead") {
            mappedMode = { type: "softDoughKnead", minutes: mins, seconds: secs };
          } else if (type === "liquid_dough_knead" || type === "liquidDoughKnead") {
            mappedMode = { type: "liquidDoughKnead", minutes: mins, seconds: secs };
          } else if (type === "steam" || type === "steaming") {
            mappedMode = { type: "steam", minutes: mins, seconds: secs };
          } else if (type === "sous_vide" || type === "sousVide") {
            mappedMode = { type: "sousVide", temperature: settings.temperature || 0, minutes: mins, seconds: secs };
          } else if (type === "slow_cooking" || type === "slowCooking") {
            mappedMode = { type: "slowCooking", temperature: settings.temperature || 0, minutes: mins, seconds: secs };
          } else if (type === "cooking_eggs" || type === "cookingEggs") {
            mappedMode = { type: "cookingEggs", size: s.mode.modeSetting?.size || "medium", texture: s.mode.modeSetting?.texture || "waxy_soft" };
          } else if (type === "precleaning") {
            mappedMode = { type: "precleaning", duration: s.mode.modeSetting?.duration || "short" };
          } else if (type === "fermentation") {
            mappedMode = { type: "fermentation", temperature: settings.temperature || 0, minutes: mins, seconds: secs };
          } else if (type === "rice_cooking" || type === "riceCooking") {
            mappedMode = { type: "riceCooking", minutes: mins, seconds: secs };
          } else if (type === "food_cooking" || type === "foodProcessor") {
            mappedMode = { type: "foodProcessor", minutes: mins, seconds: secs };
          } else if (type === "puree") {
            mappedMode = { type: "puree", minutes: mins, seconds: secs };
          } else if (type === "smoothie") {
            mappedMode = { type: "smoothie", minutes: mins, seconds: secs };
          }
        }
        return {
          title: s.title || s.description || s.text || "",
          description: s.title ? (s.description || s.text || "") : "",
          mode: mappedMode
        };
      })
    }
  };
}
