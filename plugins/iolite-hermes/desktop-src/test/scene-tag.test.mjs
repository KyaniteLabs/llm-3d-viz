import test from 'node:test'
import assert from 'node:assert/strict'
import { drawTag } from '../src/scene.js'

function fakeCtx() {
  const rects = []
  return {
    rects, font: '', letterSpacing: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: '', textBaseline: '',
    measureText: t => ({ width: t.length * 7 }),
    fillRect: (x, y, w, h) => rects.push({ x, y, w, h }), strokeRect() {}, fillText() {},
  }
}
const pal = { panelRaised: '#111', hair: '#222', text: '#eee' }
const covers = (r, k) => k.x >= r.x && k.x <= r.x + r.w && k.y >= r.y && k.y <= r.y + r.h

test('focus tag sits above the point when nothing is in the way', () => {
  const ctx = fakeCtx()
  drawTag(ctx, 400, 300, 4, 'Some Model', pal, 900, 600, [])
  const [r] = ctx.rects
  assert.ok(r.y + r.h <= 300 - 4, 'above the mark')
})

test('focus tag moves off a front mark it would otherwise hide', () => {
  // The case found in review: Claude Haiku 5.5 sat just above-right of DeepSeek (Max).
  const front = { x: 430, y: 270 }
  const ctx = fakeCtx()
  drawTag(ctx, 400, 300, 4, 'DeepSeek-V4.1-Flash-20260910 (Max)', pal, 900, 600, [front])
  const [r] = ctx.rects
  assert.ok(!covers({ x: r.x - 10, y: r.y - 10, w: r.w + 20, h: r.h + 20 }, front), 'front mark stays visible')
})

test('focus tag stays inside the canvas', () => {
  const ctx = fakeCtx()
  drawTag(ctx, 5, 5, 4, 'Edge Model', pal, 300, 200, [])
  const [r] = ctx.rects
  assert.ok(r.x >= 4 && r.y >= 4 && r.x + r.w <= 296 && r.y + r.h <= 196)
})
