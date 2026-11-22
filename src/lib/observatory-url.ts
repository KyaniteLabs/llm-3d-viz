// Kept separate from the state parser so the landing entry can route old links
// without loading the observatory's filters, scoring, or renderer.
export const SHAREABLE_STATE_KEYS = [
  "age", "agem", "providers", "families", "ax", "w", "me", "decide",
  "floor", "bias", "anchor", "open", "openness", "vram", "nr", "fam",
] as const;

export const OBSERVATORY_BOOT_KEYS = ["stage", "heat", "debug", "enc", "catalog"] as const;
export const OBSERVATORY_URL_KEYS = [...SHAREABLE_STATE_KEYS, ...OBSERVATORY_BOOT_KEYS, "brand"] as const;
