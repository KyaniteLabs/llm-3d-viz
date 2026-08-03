/**
 * A compact UI label for a curated model id. Benchmark identity remains the
 * original `model` string; this only removes parenthetical effort metadata
 * that makes lists needlessly hard to scan.
 */
export function displayName(modelId: string): string {
  return modelId
    .replace(/\s*\((?=[^)]*(?:reasoning|effort|xhigh|\bmax\b|\bhigh\b))[^)]*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
