/** Shared humanize for TTS engines (Kokoro + Web Speech). */

export function humanizeForSpeech(text: string): string {
  let t = text.trim();
  t = t.replace(/\s*·\s*/g, ", ");
  t = t.replace(/\s*—\s*/g, ", ");
  t = t.replace(/\s*→\s*/g, " to ");
  t = t.replace(/\$(\d+(?:\.\d+)?)\s*\/\s*M\b/gi, "$1 dollars per million tokens");
  t = t.replace(/\$(\d+(?:\.\d+)?)\b/g, "$1 dollars");
  t = t.replace(/\b(\d+)\s*tok\/s\b/gi, "$1 tokens per second");
  t = t.replace(/\bIndex\s+(\d+)\b/gi, "intelligence index $1");
  t = t.replace(/\bfloor\s+(\d+)\b/gi, "floor $1");
  t = t.replace(/\bVRAM\b/g, "V RAM");
  t = t.replace(/\bGB\b/g, "gigabytes");
  t = t.replace(/\bFAQ\b/g, "F A Q");
  t = t.replace(/\bApply to update Decide\?/gi, "Say apply when you want this on the stage.");
  t = t.replace(/\bApply\?/g, "Ready to apply.");
  if (t.length > 420) t = t.slice(0, 400).replace(/\s+\S*$/, "") + ".";
  return t;
}
