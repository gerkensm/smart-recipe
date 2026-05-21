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
    hotPureeingSafety: string;
    preCutIngredients: string;
    minLiquidSimmeringBasket: string;
    emulsionOilDrip: string;
    cleanDryFatFree: string;
    dropOntoRunningBlades: string;
    removeMeasuringCup: string;
    steamerSetup: string;
    lookAheadPrepTemplate: string;
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
      grossNetWeightTemplate: "Oloupat/očistit {ingredient} (cca {net} g). Do mixovací nádoby přidejte {net} g připraveného/ých {ingredient}.",
      hotPureeingSafety: "Po mixování horkých ingrediencí vyčkejte cca 10 sekund před otevřením víka.",
      preCutIngredients: "nakrájet na kousky o velikosti cca 3-4 cm",
      minLiquidSimmeringBasket: "přidat nejméně 500 ml tekutiny do mixovací nádoby",
      emulsionOilDrip: "pomalé nalévání oleje na víko, aby stékal kolem odměrky do mixovací nádoby",
      cleanDryFatFree: "Mixovací nádoba a metla musí být naprosto čisté, suché a bez tuku.",
      dropOntoRunningBlades: "vhodit otvorem ve víku na běžící nože",
      removeMeasuringCup: "vyjmout odměrku",
      steamerSetup: "sejmout víko mixovací nádoby a nasadit napařovací nástavec přímo na mixovací nádobu",
      lookAheadPrepTemplate: "Využijte čas vaření v následujícím kroku k {task}."
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
      grossNetWeightTemplate: "Obrać/oczyścić {ingredient} (daje ok. {net} g). Dodać {net} g przygotowanego/ych {ingredient} do naczynia.",
      hotPureeingSafety: "Po miksowaniu gorących składników odczekać ok. 10 sekund przed otwarciem pokrywy.",
      preCutIngredients: "pokroić na kawałki o wielkości ok. 3-4 cm",
      minLiquidSimmeringBasket: "dodać co najmniej 500 ml płynu do naczynia miksującego",
      emulsionOilDrip: "powoli wlewać olej na pokrywę, tak aby ściekał obok miarki do naczynia",
      cleanDryFatFree: "Naczynie miksujące i motylek muszą być całkowicie czyste, suche i wolne od tłuszczu.",
      dropOntoRunningBlades: "wrzucić przez otwór w pokrywie na obracające się noże",
      removeMeasuringCup: "wyjąć miarkę",
      steamerSetup: "zdjąć pokrywę naczynia miksującego i zamontować nakładkę do gotowania na parze bezpośrednio na naczyniu",
      lookAheadPrepTemplate: "Wykorzystaj czas gotowania w kolejnym kroku na {task}."
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
      grossNetWeightTemplate: "{ingredient} schälen/putzen (ergibt ca. {net} g). {net} g vorbereitete(s) {ingredient} in den Mixbehälter geben.",
      hotPureeingSafety: "Nach dem Mixen heißer Zutaten ca. 10 Sekunden warten, bevor der Deckel geöffnet wird.",
      preCutIngredients: "in ca. 3–4 cm große Stücke schneiden",
      minLiquidSimmeringBasket: "mindestens 500 ml Flüssigkeit in den Mixbehälter geben",
      emulsionOilDrip: "Öl langsam auf den Deckel gießen, sodass es am Messbecher vorbei in den Mixbehälter träufelt",
      cleanDryFatFree: "Mixbehälter und Rühraufsatz müssen absolut sauber, trocken und fettfrei sein.",
      dropOntoRunningBlades: "durch die Deckelöffnung auf die laufenden Messer fallen lassen",
      removeMeasuringCup: "den Messbecher entfernen",
      steamerSetup: "den Deckel des Mixbehälters abnehmen und den Dampfgaraufsatz direkt auf den Mixbehälter aufsetzen",
      lookAheadPrepTemplate: "Die Kochzeit im folgenden Schritt nutzen, um {task}."
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
      grossNetWeightTemplate: "Éplucher/parer {ingredient} (donne environ {net} g). Ajouter {net} g de {ingredient} préparé(s) dans le bol.",
      hotPureeingSafety: "Après avoir mixé des ingrédients chauds, attendre environ 10 secondes avant d'ouvrir le couvercle.",
      preCutIngredients: "couper en morceaux d'environ 3 à 4 cm",
      minLiquidSimmeringBasket: "ajouter au moins 500 ml de liquide dans le bol de mixage",
      emulsionOilDrip: "verser lentement l'huile sur le couvercle pour qu'elle s'écoule le long du gobelet doseur",
      cleanDryFatFree: "Le bol de mixage et le fouet doivent être absolument propres, secs et sans trace de graisse.",
      dropOntoRunningBlades: "insérer par l'orifice du couvercle sur les couteaux en marche",
      removeMeasuringCup: "retirer le gobelet doseur",
      steamerSetup: "retirer le couvercle du bol de mixage et mettre en place l'accessoire vapeur directement sur le bol",
      lookAheadPrepTemplate: "Utiliser le temps de cuisson de l'étape suivante pour {task}."
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
      grossNetWeightTemplate: "Peel/trim {ingredient} (yields approx. {net} g). Add {net} g prepared {ingredient} to the bowl.",
      hotPureeingSafety: "After pureeing hot contents, wait about 10 seconds before opening the lid.",
      preCutIngredients: "cut into pieces of approx. 3-4 cm",
      minLiquidSimmeringBasket: "add at least 500 ml of liquid to the mixing bowl",
      emulsionOilDrip: "slowly pour the oil onto the lid so it trickles past the measuring cup into the bowl",
      cleanDryFatFree: "The mixing bowl and butterfly whisk must be absolutely clean, dry, and fat-free.",
      dropOntoRunningBlades: "drop through the lid opening onto the running blades",
      removeMeasuringCup: "remove the measuring cup",
      steamerSetup: "remove the mixing bowl lid and lock the steamer attachment directly onto the mixing bowl",
      lookAheadPrepTemplate: "Use the cooking time in the following step to {task}."
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
      grossNetWeightTemplate: "Sbucciare/pulire {ingredient} (circa {net} g). Aggiungere {net} g di {ingredient} preparato/i nel boccale.",
      hotPureeingSafety: "Dopo aver frullato ingredienti caldi, attendere circa 10 secondi prima di aprire il coperchio.",
      preCutIngredients: "tagliare a pezzi di circa 3-4 cm",
      minLiquidSimmeringBasket: "aggiungere almeno 500 ml di liquido nel boccale",
      emulsionOilDrip: "versare lentamente l'olio sul coperchio in modo che coli lungo il misurino nel boccale",
      cleanDryFatFree: "Il boccale e la frusta devono essere perfettamente puliti, asciutti e privi di grasso.",
      dropOntoRunningBlades: "far cadere attraverso il foro del coperchio sulle lame in movimento",
      removeMeasuringCup: "rimuovere il misurino",
      steamerSetup: "rimuovere il coperchio del boccale e montare l'accessorio vapore direttamente sul boccale",
      lookAheadPrepTemplate: "Utilizzare il tempo di cottura del passaggio successivo per {task}."
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
