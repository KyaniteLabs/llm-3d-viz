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
