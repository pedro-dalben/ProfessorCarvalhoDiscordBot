export interface NormalizedQuery {
  normalized: string;
  form?: string;
}

const FORM_SPLIT_PATTERN =
  /^([a-z0-9]+)[ _-]+(wash|heat|frost|fan|mow|origin|altered|attack|defense|speed|alola|alolan|galar|galarian|hisui|hisuian|paldea|paldean|mega-x|mega-y|crowned|zen|therian|incarnate|white|black|dusk|dawn|ultra|low-key|amped|single-strike|rapid-strike|eternamax|gmax)$/i;

const SPECIAL_NAME_MAP: Record<string, string> = {
  "mr.mime": "mr-mime",
  mrmime: "mr-mime",
  "mr mime": "mr-mime",
  "farfetch'd": "farfetchd",
  "farfetch’d": "farfetchd",
  "farfetch'd-galar": "farfetchd-galar",
  "nidoran♀": "nidoran-f",
  "nidoran-f": "nidoran-f",
  "nidoran f": "nidoran-f",
  nidoranf: "nidoran-f",
  "nidoran♂": "nidoran-m",
  "nidoran-m": "nidoran-m",
  "nidoran m": "nidoran-m",
  nidoranm: "nidoran-m",
  "type:null": "type-null",
  "type null": "type-null",
  typenull: "type-null",
  "tapu koko": "tapu-koko",
  "tapu lele": "tapu-lele",
  "tapu bulu": "tapu-bulu",
  "tapu fini": "tapu-fini",
  "jangmo-o": "jangmo-o",
  "jangmo o": "jangmo-o",
  "hakamo-o": "hakamo-o",
  "hakamo o": "hakamo-o",
  "kommo-o": "kommo-o",
  "kommo o": "kommo-o",
  "ho-oh": "ho-oh",
  "wo-chien": "wo-chien",
  "chien-pao": "chien-pao",
  "ting-lu": "ting-lu",
  "chi-yu": "chi-yu",
  "flutter mane": "flutter-mane",
  "sandy shocks": "sandy-shocks",
  "iron treads": "iron-treads",
  "iron bundle": "iron-bundle",
  "iron hands": "iron-hands",
  "iron jugulis": "iron-jugulis",
  "iron moths": "iron-moths",
  "iron thorns": "iron-thorns",
  "roaring moon": "roaring-moon",
  "iron valiant": "iron-valiant",
  "gouging fire": "gouging-fire",
  "raging bolt": "raging-bolt",
  "iron boulder": "iron-boulder",
  "iron crown": "iron-crown",
  "great tusk": "great-tusk",
  "scream tail": "scream-tail",
  "brute bonnet": "brute-bonnet",
  "iron leaves": "iron-leaves",
};

export function normalizeName(raw: string): string {
  const lowered = raw.trim().toLowerCase();
  if (SPECIAL_NAME_MAP[lowered]) {
    return SPECIAL_NAME_MAP[lowered] ?? lowered;
  }
  const stripped = lowered
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[♀]/g, "-f")
    .replace(/[♂]/g, "-m")
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return SPECIAL_NAME_MAP[stripped] ?? stripped;
}

export function splitForm(query: string): NormalizedQuery {
  const normalized = normalizeName(query);
  const match = FORM_SPLIT_PATTERN.exec(normalized);
  if (match && match[1] && match[2]) {
    return { normalized: `${match[1]}-${match[2]}`, form: match[2] };
  }
  return { normalized };
}

export function canonicalSpeciesName(normalized: string): string {
  const parts = normalized.split("-");
  const head = parts[0] ?? normalized;
  return head;
}

export function levenshtein(a: string, b: string, cap = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const value = Math.min((current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, substitution);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > cap) return cap + 1;
    previous = current;
  }
  return previous[b.length] ?? 0;
}
