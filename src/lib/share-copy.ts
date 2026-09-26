/** DiB-style insight + method plain text for copy/share (W6). */
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
  const lines = [
    input.title?.trim() || "Model Observatory",
    input.story.trim(),
    `Axes: ${input.axes}`,
    `Sources: ${input.sources}`,
    `As of: ${input.asOf} · N plottable: ${input.nPlottable}`,
  ];
  if (input.url) lines.push(`URL: ${input.url}`);
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
    const intent = opts.intentLabel ? `${opts.intentLabel}: ` : "";
    return `${intent}Top pick for current weights is ${opts.topModel}; filament ridge marks the efficient frontier.`;
  }
  return "Speed × cost × intelligence tradeoff space — ridge is the Pareto frontier for current weights.";
}
