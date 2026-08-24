# HANDOFF — llm-3d-viz

## Status: 2026-08-24 close — alert-truthfulness shipped (#203/#204/#205), catalog 314 rows, watchdog on launchd

**Addendum 2026-08-24 afternoon (f92e78a + bab12b6):**
- **#203 closed — builder exit-code contract.** Builder exits `2 fetch · 4 parse/vet (local file) · 5 gate · 6 write · 1 unclassified`, each fatal JSON carries a `class`; `catalog-auto-update.sh` maps rc→stage (`fetch`/`parse_vet`/`builder_gate`/`write`). Local parses named at site (manual-additions, ladders, watchlist) + top-level SyntaxError backstop. Drill-verified: broken manual-additions now alerts `stage=parse_vet` (was the 08-20 `AA scrape failed` mislabel). Hermetic regression tests spawn the real builder (`tests/builder-exit-codes.test.ts`).
- **#204 closed — supersede-drift guard.** `detectSupersedeDrift` flags declared manual families present in prev draft but absent from next (renames preserve the normalized family, so absence is always drift); persisted as `supersede_drift` in the diff doc → `manual_family_drift` alert events. Operator deletion of the declaration ≠ drift. Live run: drift=[] (all five families present).
- **#205 created+closed — watchdog migrated to launchd.** The hourly silence-check was a crontab entry and died with the pipeline in the Aug-16 crontab rewrite. Now LaunchAgent `tech.kyanitelabs.llm-3d-viz.silence` (`install-catalog-watchdog.sh`, hourly + RunAtLoad, verified running). Morning-report check: heartbeat gap >1h in `logs/catalog-silence-check.log` ⇒ agent dead.
- **Suite:** 586 passed / 1 skipped (was 572/573) — 14 new tests. zsh `${PIPESTATUS}` near-miss logged in the registry (use `$pipestatus` or, better, no pipe).
- **Next natural work:** weekly divergence review (Qwen 3.6 27B +60% headline); stewardship frontier tickets #188–#192 when prioritized.

**Addendum 2026-08-24 morning (on top of the 2026-08-20 close below):**
- **Cron restored.** The Aug 16-17 pushing-dispatch canonicalization rewrote the crontab and dropped the llm-3d-viz block — pipeline was dead 8 scheduled runs. Reinstalled via `install-catalog-cron.sh`; slots 06:07/14:07/22:07 local.
- **Catalog 307 → 314:** Qwen3.8 27B AA-measured (low/medium/xhigh — the manual PRELIMINARY row auto-superseded as designed; watchlist flipped). Ornith-1.5-35B-A3B + Ornith-1.0-35B (DeepReinforce AI, MIT open-weight, provider-published benches) and Ox Alpha (`stealth/ox-alpha` — anonymous lab, promo $0 flagged non-durable, lineage speculation never stated as fact) admitted as PRELIMINARY. Scope vocabulary +1 open lab (DeepReinforce, D-H4-exempt) +1 held closed (Stealth). GLM-5.2 (max) retired upstream; ladder round-tripped.
- **Qwen repricing canary'd:** Next −22%, 3.5 397B −23%, 3.6 27B **+60%** — top weekly-review item.
- **Launch post live:** `blog/2026-08-24-model-observatory.md`, served at the canonical URL (`public/blog/`, HTTP 200), linked from `llms.txt`; SEO+AIGEO structured; public-safe. Dispatched to COO + CCO via org-bus envelopes MSG-20260824-DISPATCH-002/-003 (OG-image ask with CONTENTOS).
- **Process hardening:** three red-commit incidents of the same class (pipe-masked test gates) — commits now gate on vitest's own exit code; all three logged in BUG-SMELL-REGISTRY.
- **Open tickets after afternoon pass:** #186/#187 (stewardship SPEC+MAP, reference) + frontier #188–#192; #203/#204/#205 closed 2026-08-24. Today's catalog-event digests stay open as the review queue.

**Where things stand (end of 2026-08-20 session):**
- **Visual:** quiet-chrome relaxation shipped (ticks 11px @0.85/0.70, secondary text 11px — see DESIGN-SYSTEM Typography note). Four independent critics (kimi-rubric passes: GLM-4.5v, Gemini-via-kilo, codex-terra, plus the original kimi lineage) converge: **zero mechanical defects** on the deployed build (0 overlaps, 0 off-canvas, 0 truncated, projections tick-NMS'd + presence-gated); residual is presentation-philosophy spread only. Full record: `audits/uiux-splus-2026-08-15.md` iterations 1→4c.
- **Catalog:** rows=307 live (Gemini 3.7 Flash AA-measured; Qwen3.8 27B manual row with own published benchmarks, awaiting AA speed; Seed 2.1 Turbo manual row alive — supersede now fires only on ADMITTED AA rows). Pipeline + canary + watchdog + delivery-gated alerts all live; cron 3×/day.
- **Open tickets:** #203 (builder exit codes — mislabeled alert stages), #204 (supersede-drift guard), #186/#187 (stewardship SPEC+MAP, reference). BUG-SMELL-REGISTRY holds the battery + prevention plan.
- **Ops:** OSS publish is `scripts/publish-oss.sh` (scrub-gated, dry-run-able) — last publish `81da1ed`. Forgejo issue reads need a vps-container-minted token (`docs/agents/issue-tracker.md`). Routing doctrine: `~/.local/share/pushing-dispatch/availability.json` first; ollama cloud is NOT a provider anymore.
- **Next natural work:** #203/#204 tickets; kimi-rubric re-pass at quota refresh if a 5th critic is ever wanted; weekly divergence review.

The codex table below is the older 2026-08-09 pass, kept for history.

## Visual quality scores (codex GPT-5.6-terra xhigh vision review, 2026-08-09)

| State | Start | Final | S+ |
|-------|------:|------:|----|
| Default landing | 74 | **91** | ✅ |
| Decide open | 67 | **90** | ✅ |
| Cinema mode | 84 | **91** | ✅ |
| Mobile 390px | 34 | **90** | ✅ |

## What was done (6 passes)

### Desktop composition (74→91)
- Membrane opacity 0.12→0.05, skirt 0.06→0.025 (was "visual debris")
- Filament tube radius 0.02→0.015 core, 0.035→0.025 glow
- Label cap 40→8 (was cluttered with colliding labels)
- Projections 136px→168px (were too short to scan)
- Stage Key max-height 4.5rem→6rem (was truncating lowest item)

### Cinema (84→91)
- Tiered opacity replaces binary suppression: focus 100%, frontier 0.65×, dominated 0.08×+size×0.5
- ATLAS dock opacity 0.25, scale(0.85), hover reveal
- Cinema vignette via radial gradient
- Non-focus marks stay visible with depthWrite:false

### Mobile (34→90)
- Suppress ALL domain titles + tick labels on narrow (<640px)
- Reduce grid density (4→2 steps, 0.22→0.1 opacity)
- Only optimum model gets a label on narrow screens
- Scope-bar wraps, scope-summary hidden, h1 nowrap+ellipsis
- Mobile grid template adds explicit "status" row
- Effort-strip capped, console padded, selection-panel scrollable

### Token hygiene
- 6 hardcoded hex → CSS vars (--color-danger, --color-openness, --color-closed)
- OpenAI green removed from generic family-trail/effort-path swatches
- Stale "stubs" wording removed from axis-metrics.ts

### Earlier codex code review fixes
- MiniMax primary remapped #E91E8C→#E01E8C (4.9→8.3 dE deutan from OpenAI)
- cloud-floor.ts imports canonical CLOUD_LABS from catalog-scope.ts
- D10 palette test hard-gates ALL cloud-scope pairs

## Verification
- tsc: clean
- vitest: 313/313 pass
- Playwright viz-pixel: 3/3 pass
- Playwright visual-capture: 4/4 pass
- Codex GPT-5.6 vision: all states 90+

## Remaining notes
- Mobile utility strip density (codex: minor, not blocking)
- 8 pre-existing render suite failures (responsive titles, glyph assertions — separate from visual quality)
- Forgejo ticket IDs #147-#153 not logged (bookkeeping)
- **DeepSeek repricing effective 2026-08-16** (announced ~Aug 6: output ~$1.32/M peak, half off-peak) — cron auto-propagates new prices from AA/OpenRouter; watch blends around that date. Full data-gap audit: `audits/glm53-2026-08-14-G-datagaps.md` (1 CRIT fixed — cache=0 sentinel in 7:2:1 blend; HIGHs open: admission blind spots, AA↔OR price divergence, silent row removals)
- GLM-5.3 tracked via `data/manual-additions.json` (provider announcement, pre-AA); auto-supersedes when AA measures the family. Same mechanism ready for future pre-AA releases (e.g. ByteDance Seed 2.1 Turbo)
- **Ops (ultragoal G001/G002 live, 2026-08-14):** alerts → Forgejo issues (aggregated, deduped) + local notification; independent hourly silence watchdog (no ok:true in 24h → alert); canary + row-diff + awaiting-measurement/hidden_by_scope annex in `data/effort-gaps.generated.json` + `data/catalog-diff.generated.json`. **Weekly review while any price_divergences record has age_days > 7** (start ~2026-08-21).
- ~~**D-H4 DECISION OPEN (for Simon):**~~ **RESOLVED 2026-08-14 (Simon), amended same day:** per product line, the default stage keeps only the **newest + previous generation** ("if GPT 5.6 exists, no reason to keep anything older than GPT 5.5"). **Closed-API lifecycle only** — open-weight labs (DeepSeek, Qwen, GLM, Kimi, Meta, MiniMax, Nemotron) are exempt: local models last longer, weights stay runnable after supersession. Implemented as `GENERATION_DEPTH = 2` + `OPEN_WEIGHT_LABS` in `src/data/catalog-scope.ts` (row-level `openness` is NOT trusted for this — AA name-keyword heuristic mislabels whole labs, audit L4). Default scope 128→109 rows; `?catalog=all` remains the uncut archive; the cut is tracked operator-side as `hidden_by_scope.c_generation_capped` (19 closed rows today: Claude 4.6/4.7, GPT 5.3/5.4 main line, Gemini 3.1/3.5, Grok 4.3/4.20). Date floor unchanged.
