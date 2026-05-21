import type { CategoryKey, SupportedLocale } from "../catalogs/types.js";

export interface LocaleText {
  locale: SupportedLocale;
  outputLanguage: string;
  unitConvention: string;
  servingUnitExamples: string;
  categoryLabel: string;
  defaultIngredientGroupName: string;
  categoryLabels: Record<CategoryKey, string>;
  accessoryTerms: {
    blade: string;
    reverse: string;
    butterflyWhisk: string;
    simmeringBasket: string;
    steamerAttachment: string;
    steamerInsert: string;
    measuringCup: string;
    spatula: string;
    turbo: string;
  };
  accessoryPhrases: {
    insertButterflyWhisk: string;
    insertSimmeringBasket: string;
    attachSteamerAttachment: string;
    preheatSteamingCold: string;
    preheatSteamingHot: string;
    spatulaScrape: string;
    liftSimmeringBasket: string;
    useBasketAsSplashGuard: string;
    grossNetWeightTemplate: string;
  };
}

export const localeTexts: Record<SupportedLocale, LocaleText> = {
  "cs-CZ": {
    locale: "cs-CZ",
    outputLanguage: "Czech",
    unitConvention: "Czech recipe conventions: g, kg, ml, lžička, lžíce, špetka, kusy; use ml only when grams would be misleading.",
    servingUnitExamples: "porce, sklenice, kusy",
    categoryLabel: "Czech site IDs",
    defaultIngredientGroupName: "Suroviny",
    categoryLabels: {
      saucesAndDips: "Omáčky & dipy",
      soupsAndStews: "Polévky & dušená jídla",
      salads: "Saláty",
      sideDishes: "Přílohy",
      snacks: "Svačiny",
      mainDishes: "Hlavní jídla",
      babyFood: "Dětská výživa",
      drinks: "Nápoje",
      onePotAllInOne: "One-Pot / Vše v jednom",
      desserts: "Dezerty",
      baking: "Pečení",
      breakfast: "Snídaně",
      dinner: "Večeře",
      starters: "Předkrmy",
      jamAndJelly: "Marmelády & želé",
      germanCuisine: "Německá kuchyně",
      frenchCuisine: "Francouzská kuchyně",
      italianCuisine: "Italská kuchyně",
      polishCuisine: "Polská kuchyně",
      spanishCuisine: "Španělská kuchyně",
      foodProcessor: "Food Processor",
      vegan: "Veganské",
      vegetarian: "Vegetariánské"
    },
    accessoryTerms: {
      blade: "nástavec s noži",
      reverse: "zpětný chod",
      butterflyWhisk: "metla",
      simmeringBasket: "vařicí košík",
      steamerAttachment: "napařovací nástavec",
      steamerInsert: "plochý napařovací nástavec",
      measuringCup: "odměrka",
      spatula: "stěrka",
      turbo: "Turbo"
    },
    accessoryPhrases: {
      insertButterflyWhisk: "nasadit metlu",
      insertSimmeringBasket: "zavěsit vařicí košík",
      attachSteamerAttachment: "nasadit napařovací nástavec",
      preheatSteamingCold: "při dotazu na předehřátí zvolte 'Ano'",
      preheatSteamingHot: "při dotazu na předehřátí zvolte 'Ne'",
      spatulaScrape: "stěrkou setřete stěny nádoby dolů",
      liftSimmeringBasket: "vyjměte vařicí košík pomocí stěrky",
      useBasketAsSplashGuard: "položte vařicí košík na víko jako ochranu proti vystříknutí",
      grossNetWeightTemplate: "Oloupat/očistit {ingredient} (cca {net} g). Do mixovací nádoby přidejte {net} g připraveného/ých {ingredient}."
    }
  },
  "pl-PL": {
    locale: "pl-PL",
    outputLanguage: "Polish",
    unitConvention: "Polish recipe conventions: g, kg, ml, łyżeczka, łyżka, szczypta, sztuki; use ml only when grams would be misleading.",
    servingUnitExamples: "porcje, słoiki, sztuki",
    categoryLabel: "Polish site IDs",
    defaultIngredientGroupName: "Składniki",
    categoryLabels: {
      saucesAndDips: "Sosy i dipy",
      soupsAndStews: "Zupy i gulasze",
      salads: "Sałatki",
      sideDishes: "Dodatki",
      snacks: "Przekąski",
      mainDishes: "Dania główne",
      babyFood: "Jedzenie dla niemowląt",
      drinks: "Napoje",
      onePotAllInOne: "One-Pot / All-in-One",
      desserts: "Desery",
      baking: "Pieczenie",
      breakfast: "Śniadanie",
      dinner: "Kolacja",
      starters: "Przystawki",
      jamAndJelly: "Dżemy i galaretki",
      germanCuisine: "Kuchnia niemiecka",
      frenchCuisine: "Kuchnia francuska",
      italianCuisine: "Kuchnia włoska",
      polishCuisine: "Kuchnia polska",
      spanishCuisine: "Kuchnia hiszpańska",
      foodProcessor: "Food Processor",
      vegan: "Wegańskie",
      vegetarian: "Wegetariańskie"
    },
    accessoryTerms: {
      blade: "noże",
      reverse: "obroty w lewo",
      butterflyWhisk: "motylek",
      simmeringBasket: "koszyczek do gotowania",
      steamerAttachment: "nakładka do gotowania na parze",
      steamerInsert: "płaski wkład do gotowania na parze",
      measuringCup: "miarka",
      spatula: "szpatułka",
      turbo: "Turbo"
    },
    accessoryPhrases: {
      insertButterflyWhisk: "założyć motylek",
      insertSimmeringBasket: "zawiesić koszyczek do gotowania",
      attachSteamerAttachment: "założyć nakładkę do gotowania na parze",
      preheatSteamingCold: "wybierz 'Tak' przy pytaniu o podgrzewanie",
      preheatSteamingHot: "wybierz 'Nie' przy pytaniu o podgrzewanie",
      spatulaScrape: "zgarnąć składniki szpatułką ze ścianek naczynia",
      liftSimmeringBasket: "wyjąć koszyczek za pomocą szpatułki",
      useBasketAsSplashGuard: "nałożyć koszyczek na pokrywę jako osłonę przed pryskaniem",
      grossNetWeightTemplate: "Obrać/oczyścić {ingredient} (daje ok. {net} g). Dodać {net} g przygotowanego/ych {ingredient} do naczynia."
    }
  },
  "de-DE": {
    locale: "de-DE",
    outputLanguage: "German as used in Germany",
    unitConvention: "German recipe conventions: g, kg, EL, TL, Prise, Prisen, Stück; use ml only when grams would be misleading.",
    servingUnitExamples: "Portionen, Gläser, Stück",
    categoryLabel: "German site IDs",
    defaultIngredientGroupName: "Allgemeine Zutaten",
    categoryLabels: {
      saucesAndDips: "Saucen & Dips",
      soupsAndStews: "Suppen & Eintopfgerichte",
      salads: "Salate",
      sideDishes: "Beilagen",
      snacks: "Snacks",
      mainDishes: "Hauptgerichte",
      babyFood: "Babynahrung",
      drinks: "Getraenke",
      onePotAllInOne: "One-Pot / All-in-One",
      desserts: "Desserts",
      baking: "Backen",
      breakfast: "Fruehstueck",
      dinner: "Abendessen",
      starters: "Vorspeisen",
      jamAndJelly: "Marmelade & Gelee",
      germanCuisine: "Kueche Deutsch",
      frenchCuisine: "Kueche Franzoesisch",
      italianCuisine: "Kueche Italienisch",
      polishCuisine: "Kueche Polnisch",
      spanishCuisine: "Kueche Spanisch",
      foodProcessor: "Food Processor",
      vegan: "Vegan",
      vegetarian: "Vegetarisch"
    },
    accessoryTerms: {
      blade: "Messereinsatz",
      reverse: "Linkslauf",
      butterflyWhisk: "Rühraufsatz",
      simmeringBasket: "Kocheinsatz",
      steamerAttachment: "Dampfgaraufsatz",
      steamerInsert: "flacher Dampfgaraufsatz",
      measuringCup: "Messbecher",
      spatula: "Spatel",
      turbo: "Turbo"
    },
    accessoryPhrases: {
      insertButterflyWhisk: "Rühraufsatz einsetzen",
      insertSimmeringBasket: "Kocheinsatz einhängen",
      attachSteamerAttachment: "Dampfgaraufsatz aufsetzen",
      preheatSteamingCold: "bei der Abfrage zu Aufheizen 'Ja' wählen",
      preheatSteamingHot: "bei der Abfrage zu Aufheizen 'Nein' wählen",
      spatulaScrape: "mit dem Spatel nach unten schieben",
      liftSimmeringBasket: "den Kocheinsatz mithilfe des Spatels herausnehmen",
      useBasketAsSplashGuard: "den Kocheinsatz als Spritzschutz auf den Deckel setzen",
      grossNetWeightTemplate: "{ingredient} schälen/putzen (ergibt ca. {net} g). {net} g vorbereitete(s) {ingredient} in den Mixbehälter geben."
    }
  },
  "fr-FR": {
    locale: "fr-FR",
    outputLanguage: "French",
    unitConvention: "French recipe conventions: g, kg, ml, c. à c., c. à s., pincée, pièces; use ml only when grams would be misleading.",
    servingUnitExamples: "portions, bocaux, pièces",
    categoryLabel: "French site IDs",
    defaultIngredientGroupName: "Ingrédients",
    categoryLabels: {
      saucesAndDips: "Sauces & dips",
      soupsAndStews: "Soupes & ragoûts",
      salads: "Salades",
      sideDishes: "Accompagnements",
      snacks: "Snacks",
      mainDishes: "Plats principaux",
      babyFood: "Alimentation pour bébé",
      drinks: "Boissons",
      onePotAllInOne: "One-Pot / Tout-en-un",
      desserts: "Desserts",
      baking: "Pâtisserie",
      breakfast: "Petit déjeuner",
      dinner: "Dîner",
      starters: "Entrées",
      jamAndJelly: "Confitures & gelées",
      germanCuisine: "Cuisine allemande",
      frenchCuisine: "Cuisine française",
      italianCuisine: "Cuisine italienne",
      polishCuisine: "Cuisine polonaise",
      spanishCuisine: "Cuisine espagnole",
      foodProcessor: "Food Processor",
      vegan: "Végane",
      vegetarian: "Végétarien"
    },
    accessoryTerms: {
      blade: "bloc couteaux",
      reverse: "marche inverse",
      butterflyWhisk: "fouet",
      simmeringBasket: "panier cuisson",
      steamerAttachment: "accessoire vapeur",
      steamerInsert: "plateau vapeur",
      measuringCup: "gobelet doseur",
      spatula: "spatule",
      turbo: "Turbo"
    },
    accessoryPhrases: {
      insertButterflyWhisk: "insérer le fouet",
      insertSimmeringBasket: "accrocher le panier cuisson",
      attachSteamerAttachment: "mettre en place l'accessoire vapeur",
      preheatSteamingCold: "sélectionner 'Oui' à la question sur le préchauffage",
      preheatSteamingHot: "sélectionner 'Non' à la question sur le préchauffage",
      spatulaScrape: "racler les parois à l'aide de la spatule",
      liftSimmeringBasket: "retirer le panier cuisson à l'aide de la spatule",
      useBasketAsSplashGuard: "placer le panier cuisson sur le couvercle pour éviter les projections",
      grossNetWeightTemplate: "Éplucher/parer {ingredient} (donne environ {net} g). Ajouter {net} g de {ingredient} préparé(s) dans le bol."
    }
  },
  "en-US": {
    locale: "en-US",
    outputLanguage: "English",
    unitConvention: "English recipe conventions: g, kg, ml, tsp, tbsp, pinch, pieces; use ml only when grams would be misleading.",
    servingUnitExamples: "servings, jars, pieces",
    categoryLabel: "English site IDs",
    defaultIngredientGroupName: "Ingredients",
    categoryLabels: {
      saucesAndDips: "Sauces & Dips",
      soupsAndStews: "Soups & Stews",
      salads: "Salads",
      sideDishes: "Side Dishes",
      snacks: "Snacks",
      mainDishes: "Main Dishes",
      babyFood: "Baby Food",
      drinks: "Drinks",
      onePotAllInOne: "One-Pot / All-in-One",
      desserts: "Desserts",
      baking: "Baking",
      breakfast: "Breakfast",
      dinner: "Dinner",
      starters: "Starters",
      jamAndJelly: "Jam & Jelly",
      germanCuisine: "German Cuisine",
      frenchCuisine: "French Cuisine",
      italianCuisine: "Italian Cuisine",
      polishCuisine: "Polish Cuisine",
      spanishCuisine: "Spanish Cuisine",
      foodProcessor: "Food Processor",
      vegan: "Vegan",
      vegetarian: "Vegetarian"
    },
    accessoryTerms: {
      blade: "blade insert",
      reverse: "reverse",
      butterflyWhisk: "butterfly whisk",
      simmeringBasket: "simmering basket",
      steamerAttachment: "steamer attachment",
      steamerInsert: "flat steamer insert",
      measuringCup: "measuring cup",
      spatula: "spatula",
      turbo: "Turbo"
    },
    accessoryPhrases: {
      insertButterflyWhisk: "insert the butterfly whisk",
      insertSimmeringBasket: "hang the simmering basket",
      attachSteamerAttachment: "attach the steamer attachment",
      preheatSteamingCold: "select 'Yes' when asked to preheat",
      preheatSteamingHot: "select 'No' when asked to preheat",
      spatulaScrape: "scrape down the sides of the bowl using the spatula",
      liftSimmeringBasket: "remove the simmering basket using the spatula",
      useBasketAsSplashGuard: "place the simmering basket on the lid as a splash guard",
      grossNetWeightTemplate: "Peel/trim {ingredient} (yields approx. {net} g). Add {net} g prepared {ingredient} to the bowl."
    }
  },
  "it-IT": {
    locale: "it-IT",
    outputLanguage: "Italian",
    unitConvention: "Italian recipe conventions: g, kg, ml, cucchiaino, cucchiaio, pizzico, pezzi; use ml only when grams would be misleading.",
    servingUnitExamples: "porzioni, vasetti, pezzi",
    categoryLabel: "Italian site IDs",
    defaultIngredientGroupName: "Ingredienti",
    categoryLabels: {
      saucesAndDips: "Salse & salse",
      soupsAndStews: "Zuppe & stufati",
      salads: "Insalate",
      sideDishes: "Contorni",
      snacks: "Snack",
      mainDishes: "Piatti principali",
      babyFood: "Alimenti per bambini",
      drinks: "Bevande",
      onePotAllInOne: "One-Pot / Tutto in uno",
      desserts: "Dessert",
      baking: "Cottura al forno",
      breakfast: "Colazione",
      dinner: "Cena",
      starters: "Antipasti",
      jamAndJelly: "Marmellate & gelatine",
      germanCuisine: "Cucina tedesca",
      frenchCuisine: "Cucina francese",
      italianCuisine: "Cucina italiana",
      polishCuisine: "Cucina polacca",
      spanishCuisine: "Cucina spagnola",
      foodProcessor: "Food Processor",
      vegan: "Vegano",
      vegetarian: "Vegetariano"
    },
    accessoryTerms: {
      blade: "lama",
      reverse: "antiorario",
      butterflyWhisk: "frusta",
      simmeringBasket: "cestello di cottura",
      steamerAttachment: "accessorio vapore",
      steamerInsert: "vassoio vapore piatto",
      measuringCup: "misurino",
      spatula: "spatola",
      turbo: "Turbo"
    },
    accessoryPhrases: {
      insertButterflyWhisk: "inserire la frusta",
      insertSimmeringBasket: "agganciare il cestello di cottura",
      attachSteamerAttachment: "montare l'accessorio vapore",
      preheatSteamingCold: "selezionare 'Sì' alla domanda sul preriscaldamento",
      preheatSteamingHot: "selezionare 'No' alla domanda sul preriscaldamento",
      spatulaScrape: "spingere verso il basso con la spatola",
      liftSimmeringBasket: "rimuovere il cestello di cottura con la spatola",
      useBasketAsSplashGuard: "posizionare il cestello di cottura sul coperchio come paraspruzzi",
      grossNetWeightTemplate: "Sbucciare/pulire {ingredient} (circa {net} g). Aggiungere {net} g di {ingredient} preparato/i nel boccale."
    }
  }
};

export function getLocaleText(locale: SupportedLocale = "de-DE"): LocaleText {
  const text = localeTexts[locale];
  if (!text) {
    throw new Error(`No localization is available for locale ${locale}.`);
  }
  return text;
}
