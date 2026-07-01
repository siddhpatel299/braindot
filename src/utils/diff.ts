// Simple LCS-based line diff for GitHub-style diff view

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  oldNum: number | null;
  newNum: number | null;
  text: string;
}

/**
 * Compute a line-by-line diff between two strings using LCS.
 * Returns an array of DiffLine objects for rendering.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: DiffLine[] = [];
  let i = 0, j = 0;
  let oldNum = 1, newNum = 1;

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'context', oldNum, newNum, text: oldLines[i] });
      i++; j++; oldNum++; newNum++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'remove', oldNum, newNum: null, text: oldLines[i] });
      i++; oldNum++;
    } else {
      result.push({ type: 'add', oldNum: null, newNum, text: newLines[j] });
      j++; newNum++;
    }
  }

  while (i < m) {
    result.push({ type: 'remove', oldNum, newNum: null, text: oldLines[i] });
    i++; oldNum++;
  }

  while (j < n) {
    result.push({ type: 'add', oldNum: null, newNum, text: newLines[j] });
    j++; newNum++;
  }

  return result;
}

/** Compute diff statistics: number of additions and deletions */
export function diffStats(oldText: string, newText: string): { additions: number; deletions: number } {
  const diff = computeLineDiff(oldText, newText);
  let additions = 0, deletions = 0;
  for (const line of diff) {
    if (line.type === 'add') additions++;
    else if (line.type === 'remove') deletions++;
  }
  return { additions, deletions };
}
