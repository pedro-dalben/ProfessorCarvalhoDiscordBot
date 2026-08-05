const SPECIAL_DISPLAY: Record<string, string> = {
  "mr-mime": "Mr. Mime",
  "mr-mime-galar": "Mr. Mime (Galar)",
  farfetchd: "Farfetch'd",
  "farfetchd-galar": "Farfetch'd (Galar)",
  "nidoran-f": "Nidoran♀",
  "nidoran-m": "Nidoran♂",
  "type-null": "Type: Null",
  "ho-oh": "Ho-Oh",
  "jangmo-o": "Jangmo-o",
  "hakamo-o": "Hakamo-o",
  "kommo-o": "Kommo-o",
  "wo-chien": "Wo-Chien",
  "chien-pao": "Chien-Pao",
  "ting-lu": "Ting-Lu",
  "chi-yu": "Chi-Yu",
  "flutter-mane": "Flutter Mane",
  "sandy-shocks": "Sandy Shocks",
  "iron-treads": "Iron Treads",
  "iron-bundle": "Iron Bundle",
  "iron-hands": "Iron Hands",
  "iron-jugulis": "Iron Jugulis",
  "iron-moths": "Iron Moths",
  "iron-thorns": "Iron Thorns",
  "roaring-moon": "Roaring Moon",
  "iron-valiant": "Iron Valiant",
  "great-tusk": "Great Tusk",
  "scream-tail": "Scream Tail",
  "brute-bonnet": "Brute Bonnet",
  "iron-leaves": "Iron Leaves",
  "gouging-fire": "Gouging Fire",
  "raging-bolt": "Raging Bolt",
  "iron-boulder": "Iron Boulder",
  "iron-crown": "Iron Crown",
  "moltres-galar": "Moltres (Galar)",
  "articuno-galar": "Articuno (Galar)",
  "zapdos-galar": "Zapdos (Galar)",
};

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function displayNameFor(identifier: string): string {
  const lowered = identifier.toLowerCase();
  const special = SPECIAL_DISPLAY[lowered];
  if (special) return special;

  const formMatch =
    /^(.+)-(alola|galar|hisui|paldea|mega-x|mega-y|crowned|zen|therian|incarnate|white|black|dusk|dawn|wash|heat|frost|fan|mow|origin|altered|attack|defense|speed|ultra|low-key|amped|single-strike|rapid-strike)$/i.exec(
      lowered,
    );
  if (formMatch && formMatch[1] && formMatch[2]) {
    const base = displayNameFor(formMatch[1]);
    const form = formMatch[2].split("-").map(capitalizeWord).join(" ");
    return `${base} (${form})`;
  }

  return lowered.split("-").map(capitalizeWord).join(" ");
}
