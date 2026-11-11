/**
 * Pure logic of the "My plans" editor: kinds, provider templates (kind and covered models only,
 * never amounts), drafts and their conversion to the plans the Python half validates and saves.
 * No React, so it runs in Node tests.
 */
import { fmtPrice } from './frontier.js'

export const KINDS = [
  { id: 'sunk', label: 'Prepaid, already paid', help: 'Another token costs you $0. For plans paid up front.' },
  { id: 'amortized', label: 'Subscription, split over my usage', help: 'What you pay a month divided by the tokens you use a month. Leave tokens blank and Iolite measures them.' },
  { id: 'fixed', label: 'Fixed price per million tokens', help: 'A $/M you know, such as a negotiated rate.' },
]

/** Provider templates: kind and covered-model fragments only. No amounts, ever. */
export const TEMPLATES = [
  { id: 'anthropic', label: 'Anthropic (Claude)', cover: 'claude-' },
  { id: 'openai', label: 'OpenAI (GPT)', cover: 'gpt-' },
  { id: 'google', label: 'Google (Gemini)', cover: 'gemini-' },
  { id: 'zai', label: 'Z.ai (GLM)', cover: 'glm-' },
  { id: 'minimax', label: 'MiniMax', cover: 'minimax-' },
  { id: 'moonshot', label: 'Moonshot (Kimi)', cover: 'kimi-' },
  { id: 'deepseek', label: 'DeepSeek', cover: 'deepseek-' },
  { id: 'xai', label: 'xAI (Grok)', cover: 'grok-' },
  { id: 'xiaomi', label: 'Xiaomi (MiMo)', cover: 'mimo-' },
  { id: 'qwen', label: 'Qwen', cover: 'qwen' },
]

export const PERIODS = [1, 3, 6, 12, 24]

let seq = 0
const newId = () => `p${++seq}`

/** A saved plan (from the Python half) as an editable draft; numbers become strings. */
export function toDraft(p) {
  const str = v => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
  return {
    id: newId(),
    name: String(p.name || ''),
    mode: KINDS.some(k => k.id === p.mode) ? p.mode : 'sunk',
    cover: [...(p.models || []).map(m => '=' + m), ...(p.match || [])].join(', '),
    paid: str(p.paid_usd),
    months: PERIODS.includes(p.period_months) ? p.period_months : 12,
    tokens: str(p.tokens_per_month_m),
    usd: str(p.mode === 'fixed' ? (p.usd_per_m_set ?? p.usd_per_m) : undefined),
  }
}

export function fromTemplate(t) {
  return { id: newId(), name: `${t.label} plan`, mode: 'amortized', cover: t.cover, paid: '', months: 12, tokens: '', usd: '' }
}

export function blankDraft() {
  return { id: newId(), name: '', mode: 'amortized', cover: '', paid: '', months: 12, tokens: '', usd: '' }
}

/** Split the "covers" text into exact models (=slug) and slug fragments (3+ characters). */
export function splitCover(text) {
  // Every word is a slug fragment (3 characters or more); "=slug" names one exact model. A
  // fragment that happens to equal a full slug still covers longer slugs (glm-5 covers glm-5.3).
  const words = String(text || '').toLowerCase().split(/[\s,]+/).filter(Boolean)
  const models = [], match = []
  for (const w of words) {
    if (w.startsWith('=') && w.length > 1) models.push(w.slice(1))
    else if (w.length >= 3) match.push(w)
  }
  return { models, match }
}

/** The snapshot models a draft covers. */
export function coveredBy(draft, models) {
  const { models: exact, match } = splitCover(draft.cover)
  const ex = new Set(exact)
  return models.filter(m => { const k = m.s.toLowerCase(); return ex.has(k) || match.some(f => k.includes(f)) })
}

function num(s) {
  if (typeof s !== 'string' || !s.trim()) return null
  const v = Number(s)
  return Number.isFinite(v) ? v : NaN
}

/** {plan} ready to POST, or {problem}. Mirrors the Python validator; the server re-checks. */
export function toPlan(d, slugs) {
  const name = d.name.trim() || 'My plan'
  const { models, match } = splitCover(d.cover)
  if (!models.length && !match.length) return { problem: `${name}: say which models it covers (for example glm- or claude-)` }
  const plan = { name, mode: d.mode, models, match }
  if (d.mode === 'fixed') {
    const v = num(d.usd)
    if (v === null || Number.isNaN(v) || v < 0) return { problem: `${name}: enter the price per million tokens` }
    plan.usd_per_m = v
  }
  if (d.mode === 'amortized') {
    const paid = num(d.paid), tokens = num(d.tokens)
    if (paid === null || Number.isNaN(paid) || paid < 0) return { problem: `${name}: enter what you paid` }
    plan.paid_usd = paid
    plan.period_months = d.months
    if (tokens !== null) {
      if (Number.isNaN(tokens) || tokens <= 0) return { problem: `${name}: tokens a month must be more than 0, or blank to measure` }
      plan.tokens_per_month_m = tokens
    }
  }
  return { plan }
}

/** What the draft costs per million tokens, as a sentence, before saving. */
export function draftPrice(d, saved) {
  if (d.mode === 'sunk') return '$0/M: another token costs nothing'
  if (d.mode === 'fixed') { const v = num(d.usd); return v === null || Number.isNaN(v) ? 'enter a price' : fmtPrice(v) }
  const paid = num(d.paid), tokens = num(d.tokens)
  if (paid === null || Number.isNaN(paid)) return 'enter what you paid'
  const perMonth = paid / d.months
  if (tokens !== null && !Number.isNaN(tokens) && tokens > 0) return `${fmtPrice(perMonth / tokens)} ($${perMonth.toFixed(2)} a month / ${tokens}M tokens)`
  if (saved && typeof saved.usd_per_m === 'number' && saved.measured) {
    const ms = saved.measured
    return `${fmtPrice(saved.usd_per_m)} from ${ms.tokens_per_month_m}M tokens a month measured over ${ms.days} day${ms.days === 1 ? '' : 's'}${ms.early ? '. Early estimate: under 7 days of use, so expect it to move' : ''}`
  }
  return `$${perMonth.toFixed(2)} a month; the $/M appears once Iolite has measured your usage of these models`
}

