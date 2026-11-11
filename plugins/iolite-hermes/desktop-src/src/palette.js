/**
 * Colours for the stage, from DESIGN-SYSTEM.md (observatory-after-dark). The design system is
 * dark-first and defines no light mode, so LIGHT is derived: the same roles on warm paper,
 * with the ink and copper darkened until text keeps 4.5:1 and marks keep 3:1. test/palette.test.mjs
 * checks both modes. Copper marks focus and nothing else; frontier, picks and dominated models
 * differ by shape and luminance as well as colour.
 */
export const DARK = {
  mode: 'dark',
  ground: '#070C0B',
  panel: '#0B1110',
  panelRaised: '#10161D',
  hair: 'rgba(231,226,216,0.10)',
  text: '#E7E2D8',
  muted: '#89939E',
  frontier: '#E8F1E4',
  frontierDim: '#C9D4C4',
  dominated: '#5E7B88',
  below: '#3D5560',
  copper: '#C47A3A',
  axis: 'rgba(231,226,216,0.34)',
  grid: 'rgba(231,226,216,0.10)',
  floor: 'rgba(201,212,196,0.55)',
}

export const LIGHT = {
  mode: 'light',
  ground: '#F4F2EC',
  panel: '#FBFAF6',
  panelRaised: '#FFFFFF',
  hair: 'rgba(27,31,29,0.14)',
  text: '#1B1F1D',
  muted: '#55616A',
  frontier: '#0B1110',
  frontierDim: '#2F3B38',
  dominated: '#5F747E',
  below: '#9DADB4',
  copper: '#A4561A',
  axis: 'rgba(27,31,29,0.42)',
  grid: 'rgba(27,31,29,0.10)',
  floor: 'rgba(47,59,56,0.6)',
}

export const FONT_MONO = '"IBM Plex Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
export const FONT_SANS = '"Inter Tight", Inter, system-ui, -apple-system, "Segoe UI", sans-serif'

export function paletteFor(mode) { return mode === 'light' ? LIGHT : DARK }

/** WCAG relative luminance and contrast of two #rrggbb colours (used by the palette test). */
export function contrast(a, b) {
  const lum = hex => {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) })
      .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0)
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
