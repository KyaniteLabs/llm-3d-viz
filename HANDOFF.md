# HANDOFF — llm-3d-viz

## Status: 2026-08-26 — drift-watch shipped (#206); catalog 317 rows; Ox Alpha operator-identified; public == private

**Addendum 2026-08-29 (distribution surface phase 0+1, consensus-approved plan `docs/plans/2026-08-29-distribution-surface.md`):**
- **Phase 0 — embed framing fixed (live defect):** global `X-Frame-Options: DENY` in `public/_headers` made every advertised embed iframe dead on the public origin. `/embed/*` now carries `Content-Security-Policy: frame-ancestors *` (XFO can't be unset by a more-specific rule); the /m/ copy no longer claims "live, always current" — cards update on deploy (public deploys are approval-gated, per #206).
- **Phase 1 — model-card completion:** per-card `<link rel=canonical>` + og/twitter meta + `WebPage`/`BreadcrumbList` JSON-LD; ONE catalog-level `Dataset` JSON-LD on `/m/` (variableMeasured/creator/distribution→llms-full.txt/dateModified); per-field provenance chips (measured/derived/list) rendered from the catalog `sources` map. Slug rule extracted to `scripts/lib/slug.mjs` (kills frontier-watch's trailing-dash `/m/…-/` dead links — its inline copy lacked the strip); committed alias registry `data/slug-aliases.json` → generated `public/_redirects` with a stale-target build guard (renames get 301s; SPA fallback otherwise soft-404s with 200). Generator refactored to pure exports (`createTemplates`/`buildSitemap`/`buildRedirects`) — first-ever generator tests (`tests/gen-model-pages.test.mjs`: slug incl. `+`→plus collision rule, JSON-LD parseability, null em-dash rendering, sitemap idempotency + duplicate-loc guard, redirects guard).
- **Smoke extended:** `public-smoke.sh` now content-asserts a real model card (canonical/JSON-LD/generator note, auto-picks first sitemap slug or `SMOKE_SLUG=`) and the embed lane `frame-ancestors` header (follows the Pages 308).
- **Suite 616 passed / 1 skipped (617) after phase 2.** Build green.
- **Deployed + republished (2026-08-29, Simon's "ok go"):** review loop found the null-price P100 fabrication (honesty-core — shipped on 4 pages since the original generator; fixed in 504315d + regen 0f2b88f) plus an alias-shadow guard and hostile-name escape test. Public Pages deployed (660 files, `1100b981` build; wrangler needed a pty for stored OAuth — `script -q /dev/null`), smoke green **live** including the new model-card and embed `frame-ancestors` lanes (one smoke-helper slug-extraction bug found-and-fixed on the way — `mqwen2-5-turbo` class). Private twin synced manually same hour on Simon's "fix lag" (rsync + docker restart; entry-asset hash equal on both origins — drift alert pre-empted; 22:07 cron will find hash-equal and skip clean). That pass also found the private nginx had BOTH public-side embed defects of its own: XFO DENY on `/embed/*` AND extensionless `/embed/<slug>` falling through to the SPA shell. Fixed in `~/sites/llm-3d-viz/nginx.conf` on the vps (backup `nginx.conf.bak-20260829` alongside): `/embed/` location maps extensionless → `.html`, sends `CSP frame-ancestors *` (XFO deliberately absent on that lane only — nginx location-level add_header drops inherited ones, so nosniff/referrer re-added), missing slugs are an honest 404. Content-verified on the private origin. OSS published: **oss/main = 7b313f7** (dry-run clean first, scrub gate passed, state restored to main).
- **Next:** phase 2 SHIPPED (250 staged compare pages, dominance-gated verdicts; raise the cap only at a GSC checkpoint); phase 4 (Atom feed off a durable committed event log); phase-2 public deploy + OSS republish on Simon's go; Forgejo push owed. Council reply MSG-20260826-COO-024 is the program origin.


**Addendum 2026-08-24 afternoon (f92e78a + bab12b6):**
- **#203 closed — builder exit-code contract.** Builder exits `2 fetch · 4 parse/vet (local file) · 5 gate · 6 write · 1 unclassified`, each fatal JSON carries a `class`; `catalog-auto-update.sh` maps rc→stage (`fetch`/`parse_vet`/`builder_gate`/`write`). Local parses named at site (manual-additions, ladders, watchlist) + top-level SyntaxError backstop. Drill-verified: broken manual-additions now alerts `stage=parse_vet` (was the 08-20 `AA scrape failed` mislabel). Hermetic regression tests spawn the real builder (`tests/builder-exit-codes.test.ts`).
- **#204 closed — supersede-drift guard.** `detectSupersedeDrift` flags declared manual families present in prev draft but absent from next (renames preserve the normalized family, so absence is always drift); persisted as `supersede_drift` in the diff doc → `manual_family_drift` alert events. Operator deletion of the declaration ≠ drift. Live run: drift=[] (all five families present).
- **#205 created+closed — watchdog migrated to launchd.** The hourly silence-check was a crontab entry and died with the pipeline in the Aug-16 crontab rewrite. Now LaunchAgent `tech.kyanitelabs.llm-3d-viz.silence` (`install-catalog-watchdog.sh`, hourly + RunAtLoad, verified running). Morning-report check: heartbeat gap >1h in `logs/catalog-silence-check.log` ⇒ agent dead.
- **Suite:** 586 passed / 1 skipped (was 572/573) — 14 new tests. zsh `${PIPESTATUS}` near-miss logged in the registry (use `$pipestatus` or, better, no pipe).
- **OSS publish + curation fix (a242c94):** first real publish aborted on the scrub gate after a clean dry-run — the curation glob expanded at script start, so a leftover dry-run branch (tree without the internal files) silently skipped `docs/deploy/STATUS-*`; the gate held, the fix moves globbing after the branch checkout (`internal_paths_existing()` + nullglob + existence check) and dry-runs now return to main. Repro-verified from the hazard state. **Published: oss/main = 7d0b919** (supersedes the 08-20 `81da1ed` note below). Second time the scrub gate has saved a publish.
- **Evening fix — public site was 2 weeks stale (#206 filed):** Simon reported GLM-5.3/Grok 4.6 missing from the live options — the private instance had them; `viz.kyanitelabs.tech` was serving the Aug-10 deploy (every pipeline path is private-only, Pages publish is approval-gated, nothing watched the drift). Redeployed through the full gate checklist; public bundle now equals private (rows=312, all models present). Also: the launch post was never actually served — the morning "HTTP 200" was the Pages SPA fallback (vacuous, Class A). Now a real rendered page at `public/blog/2026-08-24-model-observatory/index.html` (canonical + OG + BlogPosting/FAQPage JSON-LD, counts refreshed 312/587), sitemap + llms.txt entries, content-asserted smoke. Drift-check ticket **#206** ready-for-agent.
- **Morning 2026-08-26:** overnight 22:07 + 06:07 runs landed uncommitted-free-of-humans: rows 317 (GLM-5.2 round-trip re-added max+none; Qwen3.8 27B tier-none card; Qwen3.6 27B Reasoning +37% keeps the divergence headline alive). **Ox Alpha operator-identified as GLM-5.3 Flash (Z AI)** — recorded in manual-additions + watchlist with operator provenance (not vendor-confirmed; identity fields unchanged for slug-match stability). Suite 586/587; Forgejo e4d35f3; OSS 33c17cd. Public Pages redeployed 2026-08-26 with Simon's go ("update all"): entry bundle = local dist hash exactly; content-asserted smoke green (GLM-5.2 round-trip row, Qwen3.8 27B, Grok 4.6, GLM-5.3, Ox Alpha note, blog body, sitemap). #206 (drift alert) still the top ticket pick.
- **#206 landed (2026-08-26, "fix all"):** `scripts/public-drift-check.sh` rides the hourly launchd watchdog — compares public vs private entry-asset hashes (PRIVATE_ORIGIN in .env, never committed; fetch failure = skip, not drift) and fires a kind-deduped `public_deploy_drift` alert once per epoch via `catalog-alerts.mjs --drift`. `scripts/public-smoke.sh` is the content-asserted post-deploy helper (index title, entry-asset vocabulary, blog-vs-SPA-shell, llms.txt, sitemap, optional SMOKE_MODEL). Live-verified: in-sync (b4CWFehz both sides), smoke green incl. Ox Alpha; suite 587+1skip with the kind-dedup regression test.
- **Next natural work:** weekly divergence review (Qwen 3.6 27B +60%, +37% today); stewardship frontier tickets #188–#192 when prioritized.

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

## 2026-08-26 — per-model pages + embeds SHIPPED (FW-1)
- scripts/gen-model-pages.mjs (wired into npm build) -> 317 /m/<slug> cards + 317 /embed/<slug> + /m/ index; zero JS/external assets; provenance-labeled; '+' slug collision fixed (command-a vs command-aplus)
- Gate receipts: build+tsc clean, 587 tests pass, _headers in dist; Cloudflare Pages deployed (canonical /embed/<slug> — Pages 308-strips .html); LIVE on viz.kyanitelabs.tech, vision-verified
- Stamped by CEO 'Finish everything' 2026-08-26; product main pushed to Forgejo origin (5cc7932+)
- **Suite count current:** **590 green at HEAD fd2b46d** ("test: fix corrupted fixture line (comment swallowed array tail); suite 590 green") — supersedes the 586/587 and 587+1skip receipts above; README Status updated to match (2026-08-27).
- Next candidates: frontier-watch alerts (FW-5, staged in takeout DECISIONS.md); sitemap/llms.txt inclusion of /m/ pages (sitemap done b89693f; llms.txt/llms-full/about/README updated 2026-08-27)
