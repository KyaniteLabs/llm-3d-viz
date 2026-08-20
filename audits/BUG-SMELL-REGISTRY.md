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
4. [ticketed] Builder exit codes: distinct rc for parse/vet failures vs fetch failures so the failure alert names the true stage (Class C) — Forgejo issue filed.
5. [ticketed] Supersede-drift guard: alert when a manual family exits the draft without a rename event in the diff (would have caught the Seed/Qwen vanish within one run) (Class D residual).

