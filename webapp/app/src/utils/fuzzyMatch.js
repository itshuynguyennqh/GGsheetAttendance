function normalize(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function matchScore(input, candidate) {
  const a = normalize(input);
  const b = normalize(candidate);

  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.9;

  const aWords = a.split(' ');
  const bWords = b.split(' ');
  const aLast = aWords[aWords.length - 1];
  const bLast = bWords[bWords.length - 1];
  if (aLast === bLast) return 0.75;

  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * @param {string} input - The name typed/spoken by user
 * @param {Array<{id: number, hoTen: string}>} students
 * @param {number} threshold - Minimum score to consider a match (default 0.4)
 * @returns {{ student: object, score: number } | null}
 */
export function findBestMatch(input, students, threshold = 0.4) {
  if (!input?.trim() || !students?.length) return null;

  let best = null;
  let bestScore = 0;

  for (const s of students) {
    const name = s.hoTen || s.name || '';
    if (!name) continue;
    const score = matchScore(input, name);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  return bestScore >= threshold ? { student: best, score: bestScore } : null;
}

/**
 * Match multiple names to multiple students (for batch assignment).
 * Each matched student is removed from the pool to avoid duplicates.
 * @param {string[]} names
 * @param {Array<{id: number, hoTen: string}>} students
 * @returns {Array<{ name: string, match: { student: object, score: number } | null }>}
 */
export function batchMatch(names, students, threshold = 0.4) {
  const remaining = [...students];
  const results = [];

  for (const name of names) {
    if (!name?.trim()) {
      results.push({ name, match: null });
      continue;
    }
    const result = findBestMatch(name, remaining, threshold);
    if (result) {
      const idx = remaining.findIndex((s) => s.id === result.student.id);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    results.push({ name, match: result });
  }

  return results;
}

export { normalize, levenshtein, matchScore };
