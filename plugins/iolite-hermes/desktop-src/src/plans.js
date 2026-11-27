/**
 * "My plans": every user's own plan prices, edited in the pane and saved by the Python half to
 * my_prices.json in the plugin data folder (POST /my-prices; validated, 0600, never shipped or
 * uploaded). Provider templates fill in only the kind and which models a plan covers; amounts
 * are always the user's own, never prefilled.
 */
import { createElement as h, useEffect, useMemo, useRef, useState } from 'react'
import { FONT_MONO } from './palette.js'
import { KINDS, PERIODS, TEMPLATES, blankDraft, coveredBy, draftPrice, fromTemplate, toDraft, toPlan } from './plans-model.js'

const fieldStyle = pal => ({ font: 'inherit', color: pal.text, background: pal.ground, border: `1px solid ${pal.hair}`, borderRadius: 4, padding: '4px 6px', minWidth: 0 })
const labelStyle = pal => ({ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: pal.muted, minWidth: 0 })
const btn = pal => ({ padding: '4px 10px', border: `1px solid ${pal.hair}`, background: 'transparent', fontFamily: FONT_MONO, fontSize: 12 })

function PlanFields({ d, n, onChange, onRemove, models, saved, pal, disabled }) {
  const covered = useMemo(() => coveredBy(d, models), [d.cover, models])
  const set = (k, v) => onChange({ ...d, [k]: v })
  const kind = KINDS.find(k => k.id === d.mode)
  const periods = d.customMonths === undefined ? PERIODS : [...PERIODS, d.customMonths].sort((a, b) => a - b)
  const fid = `iolite-plan-${d.id}`
  return h('fieldset', { disabled, style: { border: `1px solid ${pal.hair}`, borderRadius: 6, padding: '8px 10px', margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' } },
    h('legend', { style: { fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: pal.muted, padding: '0 4px' } }, `Plan ${n}`),
    h('label', { style: labelStyle(pal) }, 'Name',
      h('input', { type: 'text', value: d.name, maxLength: 80, placeholder: 'e.g. GLM coding plan', onChange: e => set('name', e.target.value), style: fieldStyle(pal) })),
    h('label', { style: labelStyle(pal) }, 'Kind',
      h('select', { value: d.mode, onChange: e => set('mode', e.target.value), 'aria-describedby': `${fid}-kind`, style: fieldStyle(pal) },
        KINDS.map(k => h('option', { key: k.id, value: k.id }, k.label)))),
    h('label', { style: { ...labelStyle(pal), gridColumn: '1 / -1' } }, 'Covers these models (slug fragments, comma separated; =slug for one exact model)',
      h('input', { type: 'text', value: d.cover, maxLength: 400, placeholder: 'glm-, kimi-k3', onChange: e => set('cover', e.target.value), 'aria-describedby': `${fid}-cov`, style: fieldStyle(pal) })),
    d.mode === 'amortized' ? h('label', { style: labelStyle(pal) }, 'You paid ($)',
      h('input', { type: 'number', min: 0, step: 'any', inputMode: 'decimal', value: d.paid, onChange: e => set('paid', e.target.value), style: fieldStyle(pal) })) : null,
    d.mode === 'amortized' ? h('label', { style: labelStyle(pal) }, 'For',
      h('select', { value: d.months, onChange: e => set('months', Number(e.target.value)), style: fieldStyle(pal) },
        periods.map(m => h('option', { key: m, value: m }, m === 1 ? '1 month' : m === 12 ? '1 year' : m === 24 ? '2 years' : `${m} months`)))) : null,
    d.mode === 'amortized' ? h('label', { style: labelStyle(pal) }, 'Tokens a month, millions (blank: measure)',
      h('input', { type: 'number', min: 0, step: 'any', inputMode: 'decimal', value: d.tokens, onChange: e => set('tokens', e.target.value), style: fieldStyle(pal) })) : null,
    d.mode === 'fixed' ? h('label', { style: labelStyle(pal) }, 'Price per million tokens ($)',
      h('input', { type: 'number', min: 0, step: 'any', inputMode: 'decimal', value: d.usd, onChange: e => set('usd', e.target.value), style: fieldStyle(pal) })) : null,
    h('div', { style: { gridColumn: '1 / -1', fontSize: 12, color: pal.muted, display: 'grid', gap: 2 } },
      h('div', { id: `${fid}-kind` }, kind ? kind.help : ''),
      h('div', { id: `${fid}-cov` }, covered.length
        ? `Covers ${covered.length} catalog model${covered.length === 1 ? '' : 's'}: ${covered.slice(0, 4).map(m => m.n).join(', ')}${covered.length > 4 ? ', ...' : ''}`
        : 'Covers no catalog model yet.'),
      h('div', { style: { color: pal.text } }, `Your price: ${draftPrice(d, saved)}`)),
    h('div', { style: { gridColumn: '1 / -1' } },
      h('button', { type: 'button', onClick: onRemove, style: btn(pal), 'aria-label': `Remove plan ${n}${d.name ? ', ' + d.name : ''}` }, 'Remove')))
}

// Older local routes omit a revision. Compare writable inputs without derived usage or prices.
function planRevision(mine, plans) {
  return mine.revision ?? JSON.stringify(plans.map(p => [
    p.name, p.mode, p.models || [], p.match || [],
    p.mode === 'fixed' ? (p.usd_per_m_set ?? p.usd_per_m) : null,
    p.mode === 'amortized' ? [p.paid_usd, p.period_months, p.measured ? null : p.tokens_per_month_m] : null,
  ]))
}

export function PlansEditor({ ctx, mine, loading, models, pal, onSaved }) {
  const fileError = mine?.revision === null ||
    (mine?.revision === undefined && Array.isArray(mine?.problems) &&
      mine.problems.some(p => typeof p === 'string' && p.startsWith('my_prices.json ')))
  const skipped = mine?.skipped_plans ?? 0
  const savedPlans = !loading && Array.isArray(mine?.plans) && !fileError && !skipped ? mine.plans : null
  const revision = savedPlans === null ? null : planRevision(mine, savedPlans)
  const [draft, setDraft] = useState(() => ({ revision, plans: savedPlans?.map(toDraft) ?? null }))
  const [status, setStatus] = useState(null)
  const [template, setTemplate] = useState('')
  const dirty = useRef(false)
  const saveInFlight = useRef(false)
  useEffect(() => {
    // A GET can fail or reload measurements during editing. Keep the user's drafts until a save succeeds.
    if (savedPlans && !dirty.current) setDraft({ revision, plans: savedPlans.map(toDraft) })
  }, [savedPlans, revision])
  const slugs = useMemo(() => models.map(m => m.s), [models])
  const savedByName = new Map((savedPlans || []).map(p => [p.name, p]))
  const saving = status?.kind === 'saving'
  const synced = revision !== null && revision === draft.revision
  const editDisabled = !synced || saving
  const conflict = dirty.current && revision !== null && !synced
  const updateDrafts = update => {
    if (editDisabled || saveInFlight.current) return
    dirty.current = true
    setDraft(prev => ({ ...prev, plans: update(prev.plans) }))
  }

  const save = async () => {
    // POST replaces the entire file. A missing or failed GET cannot stand in for an empty plan list.
    if (editDisabled || saveInFlight.current) return
    const out = draft.plans.map(d => toPlan(d, slugs))
    const problems = out.filter(o => o.problem).map(o => o.problem)
    if (problems.length) { setStatus({ kind: 'error', text: problems.join('; ') }); return }
    if (typeof ctx.rest !== 'function') { setStatus({ kind: 'error', text: 'This Hermes build has no plugin REST route, so plans cannot be saved here.' }); return }
    saveInFlight.current = true
    setStatus({ kind: 'saving', text: 'Saving…' })
    try {
      const res = await ctx.rest('/my-prices', { method: 'POST', body: { plans: out.map(o => o.plan), revision: typeof mine?.revision === 'string' ? draft.revision : undefined }, timeoutMs: 5000 })
      if (res?.ok) {
        dirty.current = false
        setStatus({ kind: 'info', text: `Saved ${out.length} plan${out.length === 1 ? '' : 's'} on this machine.` })
        onSaved()
      } else {
        setStatus({ kind: 'error', text: `Not saved: ${(res?.problems || ['the route refused']).join('; ')}` })
      }
    } catch (err) {
      setStatus({ kind: 'error', text: `Not saved: ${err?.message ? String(err.message).slice(0, 120) : 'the route is not available'}` })
    } finally {
      saveInFlight.current = false
    }
  }

  const add = () => {
    const t = TEMPLATES.find(x => x.id === template)
    updateDrafts(ds => [...ds, t ? fromTemplate(t) : blankDraft()])
    setTemplate('')
  }

  const readNotice = loading ? 'Reading saved plans before enabling Save.'
    : skipped ? `${skipped} saved plan${skipped === 1 ? '' : 's'} could not be loaded. Fix or back up and move my_prices.json, then refresh.`
      : fileError ? 'Could not read saved plans. Fix or back up and move my_prices.json, then refresh.'
        : 'Could not read saved plans. Refresh before saving.'

  return h('section', { 'aria-label': 'My plans', style: { margin: '0 16px 12px', background: pal.panelRaised, border: `1px solid ${pal.hair}`, borderRadius: 8, padding: 12, display: 'grid', gap: 10 } },
    h('h3', { style: { margin: 0, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: pal.muted } }, 'My plans'),
    h('p', { style: { margin: 0, fontSize: 12, color: pal.muted } },
      'Price the models you already pay for, so the front shows what is cheapest for you. Saved to my_prices.json in the Iolite plugin data folder; it stays on this machine. Templates fill in the provider only; amounts are yours.'),
    savedPlans === null ? h('p', { style: { margin: 0, color: pal.muted } }, readNotice) : null,
    conflict ? h('p', { role: 'alert', style: { margin: 0, color: pal.copper } },
      'Saved plans changed. Reopen My plans to load the new list before saving.') : null,
    (draft.plans || []).map((d, i) => h(PlanFields, {
      key: d.id, d, n: i + 1, models, pal, saved: savedByName.get(d.name.trim()), disabled: editDisabled,
      onChange: nd => updateDrafts(ds => ds.map(x => (x.id === d.id ? nd : x))),
      onRemove: () => updateDrafts(ds => ds.filter(x => x.id !== d.id)),
    })),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' } },
      h('label', { style: labelStyle(pal) }, 'Start from',
        h('select', { value: template, disabled: editDisabled, onChange: e => setTemplate(e.target.value), style: fieldStyle(pal) },
          h('option', { value: '' }, 'Blank plan'),
          TEMPLATES.map(t => h('option', { key: t.id, value: t.id }, t.label)))),
      h('button', { type: 'button', onClick: add, disabled: editDisabled, style: btn(pal) }, 'Add plan'),
      h('button', { type: 'button', onClick: save, disabled: editDisabled, style: { ...btn(pal), background: pal.frontier, color: pal.ground, borderColor: pal.frontier } }, 'Save plans')),
    status ? h('div', { role: status.kind === 'error' ? 'alert' : 'status', style: { fontSize: 12, color: status.kind === 'error' ? pal.copper : pal.text } }, status.text) : null)
}
