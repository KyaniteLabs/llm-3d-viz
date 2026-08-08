/** DiB-style insight + method plain text for copy/share (W6). */

/** Strip CR/LF and Unicode line/paragraph separators so external values cannot inject fake lines. */
function sanitizeSingleLine(s: string): string {
  return s.replace(/[\r\n\u0085\u2028\u2029]/g, " ").trim();
}

export interface ShareCopyInput {
  title?: string;
  story: string;
  axes: string;
  sources: string;
  asOf: string;
  nPlottable: number;
  url?: string;
}

export function buildInsightMethodCopy(input: ShareCopyInput): string {
  const cleanTitle = sanitizeSingleLine(input.title ?? "") || "Model Observatory";
  const cleanStory = sanitizeSingleLine(input.story);
  const cleanAxes = sanitizeSingleLine(input.axes);
  const cleanSources = sanitizeSingleLine(input.sources);
  const cleanAsOf = sanitizeSingleLine(input.asOf);
  const lines = [
    cleanTitle,
    cleanStory,
    `Axes: ${cleanAxes}`,
    `Sources: ${cleanSources}`,
    `As of: ${cleanAsOf} · N plottable: ${input.nPlottable}`,
  ];
  if (input.url) lines.push(`URL: ${sanitizeSingleLine(input.url)}`);
  return lines.filter(Boolean).join("\n");
}

export function defaultStoryLine(opts: {
  decideMode: boolean;
  floor?: number;
  topModel?: string | null;
  nPlottable: number;
  intentLabel?: string | null;
}): string {
  if (opts.nPlottable < 3) {
    return "Insufficient data for insight — widen scope or lower filters.";
  }
  if (opts.decideMode) {
    return `Models at or above Index floor ${opts.floor ?? 50} ranked on cost × speed (Decide shortlist).`;
  }
  if (opts.topModel) {
    const cleanTop = sanitizeSingleLine(opts.topModel);
    const intent = opts.intentLabel ? `${sanitizeSingleLine(opts.intentLabel)}: ` : "";
    return `${intent}Top pick for current weights is ${cleanTop}; filament ridge marks the efficient frontier.`;
  }
  return "Speed × cost × intelligence tradeoff space — ridge is the Pareto frontier for current weights.";
}
