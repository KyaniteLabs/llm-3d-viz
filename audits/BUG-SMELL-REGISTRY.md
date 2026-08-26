# BUG-SMELL-REGISTRY — llm-3d-viz

Standing CEO law (2026-08-18): every bug OR smell gets one line + timestamp + surface at notice-time; batch the battery (ultraqa + systematic-debugging + diagnosing-bugs + comorbidity-check) at the optimal moment; plan prevention/mitigation/remediation from results.

- 2026-08-16 ~03:20Z — uiux S+ pass — orchestrator picked a non-fleet vision critic (Z.ai MCP 4.5v) without consulting the dispatch matrix; Simon corrected; whole substitute-critic detour was avoidable.
- 2026-08-16 ~10:15Z — pipeline deploy — "0 projection overlaps" verified as PASS while panels were actually empty (vacuous truth: no ticks ⇒ no tick collisions); whiteout pixel spec also blind to empty dark panels.
- 2026-08-16 10:14Z — data refresh — FORCE=1 deploy regenerated catalog data AFTER the last green vitest run; data commit shipped without re-gating (caught 4 days later by expected-effort-ladders test).
- 2026-08-20 ~12:15Z — data pass — manual-additions.json edit broken (missing comma) aborted the builder; shell labeled it "AA scrape failed" and fired 2 mislabeled pipeline-failure alerts (scrape-stage signature, 7d dedup).
- 2026-08-20 ~12:50Z — data pass — supersede-by-snapshot-presence made families vanish (Qwen3.8 27B, earlier Seed 2.1 Turbo) when AA lists-but-doesn't-measure; plus supersede ran pre-blend so freshly-measured families produced duplicate model IDs. Fixed same day (post-blend, admitted-rows supersede) with regression tests.
- 2026-08-20 ~13:00Z — routing — orchestrator declared "kimi dead / no OpenAI key / codex deleted" from single-credential probes; live availability.json showed 3 kimi creds up, codex lanes up (proven), kilo sanctioned. Root cause: never consulted the canonical Pushing Dispatch install at ~/.local/share/pushing-dispatch/.

## Battery run 2026-08-20 ~13:15Z (end-of-day trigger, 6 smells)

**Classification (MECE by root cause):**
- Class A — vacuous verification (S2, S3): PASS evidence that doesn't assert the precondition — overlap checks on possibly-empty element sets; test gates that predate the data they certify.
- Class B — stale external state (S1, S6): decisions from cached knowledge of external systems when a live state file exists.
- Class C — error misattribution (S4): failure surfaced far from its cause; shell stage labels derive from where a script died, not what failed.
- Class D — data-logic defect (S5): supersede semantics bug — fixed same day with regression tests (manual-additions.test.ts).

**Comorbidity:** A×C co-occur around FORCE=1 deploys (data+code change together; one gate, two substrates). S5 was exposed by S3's late test but silently present for days (Seed vanish) — vacuous/absent verification let D hide.

**Prevention plan (smallest durable artifacts):**
1. [shipped 2026-08-20] Capture gate asserts projections painted before screenshots (Class A, S2).
2. [shipped 2026-08-20] Routing memory: availability.json is step zero for any lane decision (Class B).
3. [this commit] Registry + doctrine: any "0 X" verification claim must state the denominator (Class A).
4. [shipped 2026-08-24, f92e78a, #203] Builder exit codes: distinct rc for parse/vet failures vs fetch failures so the failure alert names the true stage (Class C). Drill-verified.
5. [shipped 2026-08-24, f92e78a, #204] Supersede-drift guard: alert when a manual family exits the draft without a rename event in the diff (would have caught the Seed/Qwen vanish within one run) (Class D residual).


- 2026-08-20 ~21:20Z — alerting — the 19:48Z pipeline_failure:build signature recorded but NO Forgejo issue exists: the failure alert delivered via local notification only while the Forgejo post failed silently. Signatures must gate on the Forgejo channel specifically or failures must retry (related: #203).
- 2026-08-24 16:59Z — process — commit shipped red AGAIN via the same class: `npx vitest run | grep -E "Tests "` gates on grep's exit (grep matches the summary line even when tests fail), so the && chain proceeded. Rule: gate on vitest's own exit code (`npx vitest run >/dev/null 2>&1; [ $? -eq 0 ]`), never on a pipe that always matches. Same-day fix: provider string in the Grok 4.6 ladder (xAI→SpaceXAI).
- 2026-08-24 ~16:55Z — infra — catalog cron dead 8 scheduled runs (Aug 16 21:07Z → Aug 24): the pushing-dispatch canonicalization rewrote the crontab and dropped our block. Zero alerts (watchdog sleeps with the host). Fix: reinstall via install-catalog-cron.sh; recurrence of the class already recorded in memory catalog-cron-fragility.
- 2026-08-24 ~17:00Z — meta — the cron-fragility memory EXISTED in the loaded index and was not consulted before diagnosis; the failure was re-derived from scratch (~30 min). Rule: when a failure pattern-matches anything in MEMORY.md, read that memory before investigating.
- 2026-08-24 17:50Z — process — third red-commit escape of the pipe-masked-gate class (vitest | grep); now structurally gated on the runner's own exit code in every chain used today.
- 2026-08-24 18:20Z — infra (follow-up to the cron kill) — the hourly silence watchdog was itself a crontab entry, so the Aug-16 crontab rewrite killed the watcher with the watched (both silent Aug 16→24). A watchdog that shares the failure mode it monitors is not a watchdog. Fix: launchd LaunchAgent tech.kyanitelabs.llm-3d-viz.silence (bab12b6, #205). Heartbeat check folded into morning reports: gap >1h in logs/catalog-silence-check.log ⇒ agent dead.
- 2026-08-24 18:43Z — process (near-miss, caught) — the pipe-masked-gate smell re-appeared mid-session as `${PIPESTATUS[0]:-$?}` under zsh: PIPESTATUS is bash-only, the fallback read `tail`'s rc, and a FAILED vitest run printed VITEST_RC=0. zsh spells it `$pipestatus` (lowercase); the durable rule stays "gate on the runner's own exit code, no pipe in between" (here: temp-file redirect).
- 2026-08-24 19:05Z — oss publish — curation was invocation-state dependent: INTERNAL_PATHS globbed at script start, so a run started from a leftover oss-publish HEAD (dry run never returned to main) saw no docs/deploy/STATUS-* on disk, the glob collapsed to its literal, and curation silently skipped the files the checkout had just re-materialized. The scrub gate caught it and aborted (second time the gate has saved a publish) — but the fix belongs upstream of the gate: globs now expand inside internal_paths_existing() AFTER the branch checkout (a242c94), and dry-runs return to main. Repro-verified from the hazard state.

## Battery run 2026-08-24 ~19:20Z (afternoon batch, 3 smells — compact pass)

All three arrived pre-root-caused with same-session fixes, so the battery ran
as classification + comorbidity rather than re-derivation:

- S7 watchdog-shares-failure-mode (infra redundancy): hourly silence-check lived in the crontab it watched; the Aug-16 rewrite killed both. **Fixed structurally** — launchd agent (#205, bab12b6). Residual: cron-block self-absence still only human-checked (morning heartbeat).
- S8 pipe-masked gate, zsh dialect (process): `${PIPESTATUS[0]:-$?}` under zsh read tail's rc and printed VITEST_RC=0 on a FAILED run — third variant of the 08-20 class, noticed ~24h after the rule was written; caught by reading the output the rule made suspect. zsh spells it `$pipestatus` (lowercase); durable rule unchanged: no pipe between the runner and its exit-code gate.
- S9 dry-run state leak → curation state-dependence (tooling hygiene): dry run left HEAD on the publish branch; the next run's assignment-time glob collapsed against that tree and silently skipped internal files the checkout re-materialized. **Fixed structurally** (post-checkout globbing, dry-run returns to main) and the scrub gate held — second publish it has saved.

**MECE:** S7 shared failure domain · S8 verification gating · S9 state hygiene between invocations.
**Comorbidity:** S8×S9 — both are "state from a previous step silently changes what the next step verifies"; S9×gate doctrine is the positive pair (defense-in-depth converted a silent skip into a loud abort).
**Prevention:** S7 launchd migration + morning heartbeat check (shipped) · S8 exit-code-gate rule + zsh note (shipped, memory) · S9 post-checkout globbing + dry-run state restoration (shipped in-repo; cross-project rule captured to memory dry-run-state-restoration).
- 2026-08-24 ~23:50Z — public deploy — viz.kyanitelabs.tech served a 2-week-old build (facd304) while the private instance stayed current: every deploy path (cron, manual runs) is private-only; Pages publish is approval-gated by design, so NOTHING flagged the drift. Simon caught it as "GLM-5.3 and Grok 4.6 missing" — missing models were the symptom, stale public deploy was the disease. Fixed: redeployed (gate checklist run); ticket #206 for a public-drift check.
- 2026-08-24 ~23:55Z — content (Class A recurrence) — the launch post's "live at canonical URL, HTTP 200" verification this morning was vacuous: /blog/<slug>/ had no file behind it, so Pages' SPA fallback returned the app shell with 200. The blog was never actually served. Fixed: hand-rendered HTML at public/blog/<slug>/index.html (canonical + OG + BlogPosting/FAQPage JSON-LD, counts refreshed 312/587), sitemap + llms.txt entries, content-asserted smoke (title/body/phrase greps, not status-only). Doctrine: a "page is live" claim must assert page CONTENT, never status alone.
- 2026-08-26 16:05Z — prevention shipped — #206 drift watch live: public-vs-private entry-asset comparison in the hourly launchd watchdog (kind-deduped alert, one issue per epoch) + content-asserted smoke helper; the "public silently stale until a human notices" class is closed for both detection (alert) and verification (smoke). Approval-gated public publish policy unchanged — drift becomes LOUD, never auto-fixed.
- 2026-08-26 ~09:00Z — process (near-miss) — on resume after an idle window, the dirty data/ tree + failing ladder tests were initially misattributed to my own in-flight edit; actually the overnight cron (22:07 PDT, rows 312→317) had run unattended after the last commit. Rule: on any resume, diff pipeline-log runs since the last data/ commit BEFORE diagnosing "unexpected" data state — the pipeline is ahead of git by design between commits.
- 2026-08-26 (recurrence, by design) — ladder registry lagged AA round-trips AGAIN (GLM-5.2 removed-then-re-published; Qwen3.8 27B tier-'none' card): second occurrence of the Gemini-3.7-Flash class. Working as intended — the test names the exact missing rungs; note-form fix each time. Candidate automation (not built): test-failure message could emit the exact JSON patch.
- 2026-08-26 (minor, self) — my shell guard `[ $rc -ne 0 ] && grep …` exits 1 on SUCCESS (compound takes the failed test's status) — confusing my own tooling twice in one day. Write guards as `if [ $rc -ne 0 ]; then …; fi` or put the failure branch last behind an explicit exit.

## Battery run 2026-08-26 ~16:20Z (public-face batch, 4 smells — compact pass)

All arrived root-caused with same-session fixes; classification + comorbidity only:

- S10 public deploy silent drift (deploy surface): approval-gated public publish + private-only pipeline = structural drift; 2 weeks stale before anyone noticed (2026-08-24). **Fixed** — #206 drift watch in the hourly launchd watchdog (kind-deduped alert) + approval policy unchanged (4c17ff7).
- S11 vacuous-200 content check (Class A recurrence): blog "live" verified by status alone; SPA fallback served the app shell. **Fixed** — content-asserted smoke helper (public-smoke.sh) + doctrine line; deploy doc points at it.
- S12 resume-time pipeline catch-up (process): uncommitted cron output between sessions read as "mystery" dirty state and misattributed test failures. Rule captured (log line above + memory resume-catches-uncommitted-pipeline).
- S13 compound-guard exit quirk (self-tooling): cosmetic, rule logged above.

**MECE:** S10 deploy-surface policy · S11 verification precondition · S12 session/state reconciliation · S13 tooling hygiene.
**Comorbidity:** S10×S11 co-occurred as one incident (stale deploy masked by a vacuous check — detection failed on both layers); S12 shares "state from a previous step silently changes what the next step sees" with S9 (same family, now three members: dry-run leaks, pipe-masked exits, overnight pipeline output).
**Prevention:** S10 watchdog+smoke (shipped) · S11 content-assertion doctrine + helper (shipped) · S12 memory rule (shipped) · S13 logged. Positive datapoint: the read-first memory doctrine prevented a duplicate memory write this session (public-pages-drift existed — checked before writing).
