/**
 * Iolite, desktop half: "Iolite: model landscape", a pane that plots the bundled catalog.
 * Imports only @hermes/plugin-sdk and react. No network of its own: the data is inlined, and
 * the one REST call goes to this plugin's own Python half (/api/plugins/iolite/landscape) for
 * locally measured speed and your last shortlist. If that route is absent the pane says so.
 */
import { COMPOSER_AREAS, GHOST_ICON_BTN, PALETTE_AREA, host } from '@hermes/plugin-sdk'
import { createElement as h } from 'react'
import { LandscapePane } from './pane.js'

const PANE_ID = 'iolite:landscape'
const TITLE = 'Iolite: model landscape'
let pluginCtx = null

export function openLandscape() {
  if (typeof host.openWorkspace !== 'function') {
    if (typeof host.notify === 'function') host.notify({ title: TITLE, message: 'This Hermes Desktop build cannot open workspace panes. Update Hermes Desktop to use the landscape.' })
    return null
  }
  return host.openWorkspace(PANE_ID, {
    title: 'Model landscape',
    minWidth: '28rem',
    render: () => h(LandscapePane, { ctx: pluginCtx }),
  })
}

export default {
  /* Equals plugin.yaml's name and the dashboard manifest's name: ctx.rest is namespaced by this
   * id, and the Python half serves /api/plugins/iolite/. */
  id: 'iolite',
  name: 'Iolite',
  description: 'Model landscape: price, intelligence and context or speed in 3D, the cost by intelligence front, and your /iolite picks.',
  register(ctx) {
    pluginCtx = ctx
    ctx.register({
      area: COMPOSER_AREAS.actions,
      id: 'model-landscape',
      title: TITLE,
      render: () => h('button', {
        type: 'button',
        className: GHOST_ICON_BTN,
        title: 'Iolite: model landscape, price by intelligence by context or speed',
        onClick: e => { e.preventDefault(); openLandscape() },
      }, 'Iolite'),
    })
    if (PALETTE_AREA) {
      ctx.register({
        id: 'model-landscape',
        area: PALETTE_AREA,
        data: {
          id: 'model-landscape',
          label: TITLE,
          keywords: ['iolite', 'model', 'landscape', 'price', 'intelligence', 'frontier', 'pareto', 'cost', 'compare'],
          detail: () => 'price by intelligence, 3D',
          detailVariant: 'state',
          run: () => { openLandscape() },
        },
      })
    }
  },
}
