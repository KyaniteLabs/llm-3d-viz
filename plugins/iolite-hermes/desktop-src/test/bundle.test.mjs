// Load the BUILT desktop/plugin.js against a mocked SDK and drive register(), the way the
// Hermes loader does: only @hermes/plugin-sdk and react may be imported, both are rewritten
// to local stubs, and nothing else may be imported at all.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundlePath = path.join(here, '../../desktop/plugin.js')
const src = readFileSync(bundlePath, 'utf8')

const SDK_STUB = `
export const COMPOSER_AREAS = { actions: 'composer.actions' }
export const GHOST_ICON_BTN = 'ghost-btn'
export const PALETTE_AREA = 'command-palette'
export const calls = { workspaces: [], notices: [] }
export const host = {
  openWorkspace(id, opts) { calls.workspaces.push({ id, opts }); return () => {} },
  notify(n) { calls.notices.push(n) },
}
export function useTheme() { return { renderedMode: 'dark' } }
`
const REACT_STUB = `
export function createElement(type, props, ...children) { return { type, props: props || {}, children } }
export const useState = v => [typeof v === 'function' ? v() : v, () => {}]
export const useEffect = () => {}
export const useMemo = f => f()
export const useRef = () => ({ current: null })
export const useCallback = f => f
`

function load(extra = '') {
  const dir = mkdtempSync(path.join(tmpdir(), 'iolite-bundle-'))
  const sdk = path.join(dir, 'sdk.mjs'), react = path.join(dir, 'react.mjs')
  writeFileSync(sdk, SDK_STUB + extra); writeFileSync(react, REACT_STUB)
  const urls = { '@hermes/plugin-sdk': pathToFileURL(sdk).href, react: pathToFileURL(react).href, 'react/jsx-runtime': pathToFileURL(react).href }
  const rewritten = src.replace(/(from\s*)(["'])(@hermes\/plugin-sdk|react(?:\/jsx-runtime)?)\2/g, (_, pre, q, spec) => `${pre}${q}${urls[spec]}${q}`)
  const leftover = [...rewritten.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g)].map(m => m[1]).filter(s => !s.startsWith('file:'))
  assert.deepEqual(leftover, [], 'the bundle imports something other than the SDK and react')
  const file = path.join(dir, 'plugin.mjs')
  writeFileSync(file, rewritten)
  return { dir, file, sdk }
}

test('bundle: no forbidden constructs and no remote or dynamic imports', () => {
  for (const [name, re] of [['eval', /\beval\s*\(/], ['new Function', /new\s+Function\b/], ['dynamic import', /\bimport\s*\(/],
    ['script tag', /<script/i], ['createElement script', /createElement\(\s*['"]script/], ['url import', /from\s*["'](?:https?|data|blob):/],
    ['data-slot query', /\[data-(?:slot|tour|sidebar|testid)/], ['hermesDesktop', /window\.hermesDesktop/], ['fetch', /\bfetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/], ['WebSocket', /new\s+WebSocket/]]) {
    assert.ok(!re.test(src), `bundle contains ${name}`)
  }
})

test('bundle: no Artificial Analysis data or name outside refusal text', () => {
  assert.ok(!/artificial analysis/i.test(src))
})

test('register() contributes a composer action and a palette command that open the pane', async () => {
  const { dir, file, sdk } = load()
  try {
    const plugin = (await import(pathToFileURL(file).href)).default
    const stubs = await import(pathToFileURL(sdk).href)
    assert.equal(plugin.id, 'iolite')
    assert.equal(plugin.capabilities, undefined, 'declares no sensitive capability, and uses none')
    assert.equal(typeof plugin.register, 'function')
    const registered = []
    const ctx = { register: c => { registered.push(c); return () => {} }, rest: async () => ({ ok: true }) }
    plugin.register(ctx)
    const composer = registered.find(c => c.area === 'composer.actions')
    const palette = registered.find(c => c.area === 'command-palette')
    assert.ok(composer && palette, 'one composer action and one palette command')
    assert.equal(registered.length, 2)
    assert.equal(palette.data.label, 'Iolite: model landscape')
    assert.ok(palette.data.keywords.includes('iolite'))
    const button = composer.render()
    assert.equal(button.type, 'button')
    assert.equal(button.props.className, 'ghost-btn')
    // both entry points open the same stable pane
    palette.data.run()
    button.props.onClick({ preventDefault() {} })
    assert.equal(stubs.calls.workspaces.length, 2)
    for (const w of stubs.calls.workspaces) {
      assert.equal(w.id, 'iolite:landscape')
      const el = w.opts.render()
      assert.equal(typeof el.type, 'function')
      assert.equal(el.props.ctx, ctx)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('without host.openWorkspace the action says so instead of failing', async () => {
  const { dir, file, sdk } = load()
  try {
    const plugin = (await import(pathToFileURL(file).href + '?old')).default
    const stubs = await import(pathToFileURL(sdk).href)
    const old = stubs.host.openWorkspace
    delete stubs.host.openWorkspace
    const registered = []
    plugin.register({ register: c => registered.push(c), rest: async () => ({}) })
    registered.find(c => c.area === 'command-palette').data.run()
    assert.equal(stubs.calls.notices.length, 1)
    assert.match(stubs.calls.notices[0].message, /Update Hermes Desktop/)
    stubs.host.openWorkspace = old
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('register() adds a sidebar entry and a /iolite page when the Desktop has those areas', async () => {
  const { dir, file } = load("export const ROUTES_AREA = 'routes'\nexport const SIDEBAR_NAV_AREA = 'sidebar.nav'\n")
  try {
    const plugin = (await import(pathToFileURL(file).href)).default
    const registered = []
    plugin.register({ register: c => { registered.push(c); return () => {} }, rest: async () => ({ ok: true }) })
    const page = registered.find(c => c.area === 'routes')
    const nav = registered.find(c => c.area === 'sidebar.nav')
    assert.ok(page && nav, 'one route and one sidebar entry')
    assert.equal(registered.length, 4)
    assert.equal(page.data.path, '/iolite')
    assert.deepEqual(nav.data, { path: '/iolite', label: 'Iolite', codicon: 'graph-scatter' })
    assert.equal(typeof page.render().type, 'function', 'the page renders the landscape pane')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
