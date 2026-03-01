/**
 * Entity Matching Engine (TypeScript)
 * Fuzzy matching for companies, people, and addresses across data sources.
 */

const COMPANY_SUFFIXES = [
  /\binc\.?\b/gi, /\bltd\.?\b/gi, /\bcorp\.?\b/gi, /\bcorporation\b/gi,
  /\bco\.?\b/gi, /\bllc\b/gi, /\bllp\b/gi, /\blp\b/gi, /\bpartnership\b/gi,
  /\bholdings?\b/gi, /\bgroup\b/gi, /\bproperties\b/gi, /\binvestments?\b/gi,
  /\brealty\b/gi, /\btrust\b/gi, /\bassociates?\b/gi, /\benterprise[s]?\b/gi,
  /\bdevelopment[s]?\b/gi, /\bconstruction\b/gi,
];

const ADDRESS_ABBREVS: Record<string, string> = {
  avenue: "ave", street: "st", drive: "dr", road: "rd",
  boulevard: "blvd", crescent: "cres", place: "pl",
  court: "crt", lane: "ln", terrace: "terr",
  parkway: "pkwy", highway: "hwy", circle: "cir",
  north: "n", south: "s", east: "e", west: "w",
};

function sequenceMatchRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  // Simple implementation of SequenceMatcher ratio
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length < b.length ? a : b;
  if (longer.length === 0) return 1.0;

  // Find longest common subsequence length
  const m = shorter.length;
  const n = longer.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (shorter[i - 1] === longer[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  return (2.0 * dp[m][n]) / (m + n);
}

export function normalizeCompanyName(name: string): string {
  if (!name) return "";
  let n = name.toLowerCase().trim();
  n = n.replace(/[.,;:'"()\-]/g, " ");
  for (const suffix of COMPANY_SUFFIXES) {
    n = n.replace(suffix, "");
  }
  return n.replace(/\s+/g, " ").trim();
}

export function normalizePersonName(name: string): string {
  if (!name) return "";
  let n = name.toLowerCase().trim();
  n = n.replace(/[.,;:'"()\-]/g, " ").replace(/\s+/g, " ").trim();
  return n.split(" ").sort().join(" ");
}

export function normalizeAddress(address: string): string {
  if (!address) return "";
  let a = address.toLowerCase().trim();
  a = a.replace(/#\d+|suite\s*\d+|unit\s*\d+/gi, "");
  for (const [full, abbr] of Object.entries(ADDRESS_ABBREVS)) {
    a = a.replace(new RegExp(`\\b${full}\\b`, "g"), abbr);
    a = a.replace(new RegExp(`\\b${abbr}\\.\\b`, "g"), abbr);
  }
  a = a.replace(/[A-Z]\d[A-Z]\s*\d[A-Z]\d/gi, "");
  a = a.replace(/,?\s*(?:saskatchewan|sk|canada)\b/gi, "");
  a = a.replace(/[,.]/g, " ");
  return a.replace(/\s+/g, " ").trim();
}

export interface MatchResult {
  name: string;
  id?: number;
  score: number;
  source?: string;
}

export function matchCompany(
  name: string,
  candidates: { name: string; id?: number; source?: string }[],
  threshold = 0.80
): MatchResult[] {
  const normName = normalizeCompanyName(name);
  if (!normName) return [];

  const matches: MatchResult[] = [];
  for (const cand of candidates) {
    const normCand = normalizeCompanyName(cand.name);
    if (!normCand) continue;

    let score = sequenceMatchRatio(normName, normCand);

    // Boost exact token overlap
    const nameTokens = new Set(normName.split(" "));
    const candTokens = new Set(normCand.split(" "));
    const overlap = [...nameTokens].filter((t) => candTokens.has(t)).length;
    const maxTokens = Math.max(nameTokens.size, candTokens.size);
    if (maxTokens > 0) {
      score = Math.max(score, overlap / maxTokens);
    }

    // Numbered company match (e.g. "102118427 Saskatchewan")
    const numA = normName.match(/^(\d{6,})/);
    const numB = normCand.match(/^(\d{6,})/);
    if (numA && numB && numA[1] === numB[1]) score = 1.0;

    if (score >= threshold) {
      matches.push({ name: cand.name, id: cand.id, score: Math.round(score * 1000) / 1000, source: cand.source });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

export function matchPerson(
  name: string,
  candidates: { name: string; id?: number }[],
  threshold = 0.85
): MatchResult[] {
  const normName = normalizePersonName(name);
  if (!normName) return [];

  const matches: MatchResult[] = [];
  for (const cand of candidates) {
    const normCand = normalizePersonName(cand.name);
    if (!normCand) continue;

    let score = sequenceMatchRatio(normName, normCand);
    if (normName === normCand) score = 1.0;

    if (score >= threshold) {
      matches.push({ name: cand.name, id: cand.id, score: Math.round(score * 1000) / 1000 });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

export function matchAddress(
  address: string,
  candidates: { address: string; id?: number }[],
  threshold = 0.75
): (MatchResult & { address: string })[] {
  const normAddr = normalizeAddress(address);
  if (!normAddr) return [];

  const matches: (MatchResult & { address: string })[] = [];
  for (const cand of candidates) {
    const normCand = normalizeAddress(cand.address);
    if (!normCand) continue;

    let score = sequenceMatchRatio(normAddr, normCand);

    // Boost if street number matches
    const numA = normAddr.match(/^(\d+)\s+(.+)/);
    const numB = normCand.match(/^(\d+)\s+(.+)/);
    if (numA && numB && numA[1] === numB[1]) {
      const streetScore = sequenceMatchRatio(numA[2], numB[2]);
      score = Math.max(score, streetScore * 0.95);
    }

    if (score >= threshold) {
      matches.push({
        name: cand.address,
        address: cand.address,
        id: cand.id,
        score: Math.round(score * 1000) / 1000,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
