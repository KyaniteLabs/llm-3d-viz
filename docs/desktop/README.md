# Iolite Desktop landscape

The November 21 snapshot plots 265 of 631 catalog models. Six models are on the price–intelligence front, from free to $16 per million tokens. The default detail panel shows Gemma 4 31B IT, the cheapest model on that front. Hover, keyboard focus, or an explicit pick can change the detail.

## Palette and typography

Iolite follows the Hermes SDK's rendered light or dark mode and defaults to dark when the host does not expose its theme. Both palettes are defined in [palette.js](../../plugins/iolite-hermes/desktop-src/src/palette.js).

| Role | Dark | Light | Where it appears |
| --- | --- | --- | --- |
| Iolite violet-blue | `#AAA6FF` | `#4C45A8` | Wordmark, active controls, front wire spheres and ridge |
| Slate | `#5E7B88` | `#5F747E` | Small rings off the front |
| Teal | `#81CDB7` | `#176B5D` | Shortlist diamonds |
| Copper | `#C47A3A` | `#A4561A` | Active model ring and keyboard focus |
| Faded slate | `#3D5560` | `#9DADB4` | Models below the displayed intelligence floor |

Inter Tight is used for display and body text. IBM Plex Mono is used for controls, ticks, and chart annotations. The build embeds the repository's Latin-subset font files and their SIL Open Font License notice in `desktop/plugin.js`. [Font license](../../plugins/iolite-hermes/desktop-src/FONT-LICENSE.txt)

## Chromium captures

The captures use the shipped Desktop bundle, a minimal Hermes SDK mock, and the Python plugin's `landscape_state()` response from an empty Hermes home. Each captures the 1440 × 900 px pane using the public bundled catalog. The loading capture delays the local response. The error capture returns a fixture failure from the local route. The chart remains readable in both because the catalog is embedded in the Desktop bundle.

- [Dark](iolite-dark.webp)
- [Light](iolite-light.webp)
- [Loading local data](iolite-loading.webp)
- [Local data unavailable](iolite-error.webp)

The mock runs also checked that all toolbar controls fit in a 1120 px pane, a 390 px pane has no horizontal overflow, all three embedded font files load, chart axis titles sit outside the 3D canvas, a pinned model persists across view changes and refresh, and attribution expands.

## Native Linux verification

At 1440 × 900, the pinned Hermes 0.23.0 host opened Iolite from the composer, sidebar, and command palette. The one-row toolbar, 2D switch, refresh, plans editor, embedded fonts, and light-to-dark switch through Hermes settings passed. The clean profile used an inference fixture and contained no private user data.

- [Native light](iolite-native-light.webp)
- [Native dark](iolite-native-dark.webp)

Formal acceptance still needs the private 1org checklist. [Issue #23](https://github.com/KyaniteLabs/llm-3d-viz/issues/23)
