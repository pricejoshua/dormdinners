const STOPWORDS = new Set(['fresh','organic','boneless','skinless','large','small','lean','extra','of','the','a','an']);

export function normalizeTokens(name: string): string[] {
  // Lowercase
  const lowercased = name.toLowerCase();

  // Replace non-alphanumeric chars with spaces
  const spaced = lowercased.replace(/[^a-z0-9\s]/g, ' ');

  // Split on whitespace and drop empties
  const tokens = spaced.split(/\s+/).filter(token => token.length > 0);

  // Drop stopwords
  const filtered = tokens.filter(token => !STOPWORDS.has(token));

  // Strip single trailing 's' from each token
  const stripped = filtered.map(token => {
    if (token.endsWith('s') && token.length > 1) {
      return token.slice(0, -1);
    }
    return token;
  });

  return stripped;
}

export function matchesStaple(ingredientName: string, stapleName: string): boolean {
  const st = normalizeTokens(stapleName);

  // If staple is empty, return false
  if (st.length === 0) {
    return false;
  }

  const it = normalizeTokens(ingredientName);

  // Check if every token in staple is in ingredient
  return st.every(stapleToken => it.includes(stapleToken));
}

export function staplesForIngredient(ingredientName: string, staples: string[]): string[] {
  const ingredientTokens = normalizeTokens(ingredientName);

  // Filter to matching staples
  const matching = staples.filter(staple => matchesStaple(ingredientName, staple));

  // Sort by:
  // 1. Descending token-overlap count
  // 2. Descending staple-token-count as tiebreak
  matching.sort((a, b) => {
    const aTokens = normalizeTokens(a);
    const bTokens = normalizeTokens(b);

    // Count overlaps
    const aOverlap = aTokens.filter(token => ingredientTokens.includes(token)).length;
    const bOverlap = bTokens.filter(token => ingredientTokens.includes(token)).length;

    // Primary sort: descending overlap
    if (aOverlap !== bOverlap) {
      return bOverlap - aOverlap;
    }

    // Tiebreak: descending token count
    return bTokens.length - aTokens.length;
  });

  return matching;
}
