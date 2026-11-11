import test from 'node:test'
import assert from 'node:assert/strict'
import { DARK, LIGHT, contrast } from '../src/palette.js'

for (const pal of [DARK, LIGHT]) {
  test(`${pal.mode}: text and muted text read on ground and panels (4.5:1)`, () => {
    for (const bg of [pal.ground, pal.panel, pal.panelRaised]) {
      assert.ok(contrast(pal.text, bg) >= 4.5, `text on ${bg}`)
      assert.ok(contrast(pal.muted, bg) >= 4.5, `muted on ${bg}: ${contrast(pal.muted, bg).toFixed(2)}`)
    }
  })
  test(`${pal.mode}: marks and the focus ring show against the ground (3:1)`, () => {
    for (const k of ['frontier', 'frontierDim', 'dominated', 'copper']) assert.ok(contrast(pal[k], pal.ground) >= 3, `${k}: ${contrast(pal[k], pal.ground).toFixed(2)}`)
  })
  test(`${pal.mode}: a front mark is clearly stronger than a dominated one`, () => {
    assert.ok(contrast(pal.frontier, pal.ground) > contrast(pal.dominated, pal.ground) + 1)
  })
}
