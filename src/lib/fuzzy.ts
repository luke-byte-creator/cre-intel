/**
 * Simple fuzzy matching utility — trigram-based similarity.
 */

function trigrams(s: string): Set<string> {
  const normalized = s.toLowerCase().trim();
  const padded = `  ${normalized} `;
  const result = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function fuzzyMatch<T>(
  items: T[],
  query: string,
  getFields: (item: T) => string[],
  threshold = 0.2
): { item: T; score: number }[] {
  if (!query.trim()) return items.map((item) => ({ item, score: 1 }));

  const results: { item: T; score: number }[] = [];
  const q = query.toLowerCase();

  for (const item of items) {
    const fields = getFields(item);
    let bestScore = 0;

    for (const field of fields) {
      if (!field) continue;
      const f = field.toLowerCase();
      // Exact substring match gets high score
      if (f.includes(q)) {
        bestScore = Math.max(bestScore, 0.9 + (q.length / f.length) * 0.1);
      } else {
        bestScore = Math.max(bestScore, similarity(q, f));
      }
    }

    if (bestScore >= threshold) {
      results.push({ item, score: bestScore });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
