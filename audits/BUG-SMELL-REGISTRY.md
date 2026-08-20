# BUG-SMELL-REGISTRY — llm-3d-viz

Standing CEO law (2026-08-18): every bug OR smell gets one line + timestamp + surface at notice-time; batch the battery (ultraqa + systematic-debugging + diagnosing-bugs + comorbidity-check) at the optimal moment; plan prevention/mitigation/remediation from results.

- 2026-08-16 ~03:20Z — uiux S+ pass — orchestrator picked a non-fleet vision critic (Z.ai MCP 4.5v) without consulting the dispatch matrix; Simon corrected; whole substitute-critic detour was avoidable.
- 2026-08-16 ~10:15Z — pipeline deploy — "0 projection overlaps" verified as PASS while panels were actually empty (vacuous truth: no ticks ⇒ no tick collisions); whiteout pixel spec also blind to empty dark panels.
- 2026-08-16 10:14Z — data refresh — FORCE=1 deploy regenerated catalog data AFTER the last green vitest run; data commit shipped without re-gating (caught 4 days later by expected-effort-ladders test).
- 2026-08-20 ~12:15Z — data pass — manual-additions.json edit broken (missing comma) aborted the builder; shell labeled it "AA scrape failed" and fired 2 mislabeled pipeline-failure alerts (scrape-stage signature, 7d dedup).
- 2026-08-20 ~12:50Z — data pass — supersede-by-snapshot-presence made families vanish (Qwen3.8 27B, earlier Seed 2.1 Turbo) when AA lists-but-doesn't-measure; plus supersede ran pre-blend so freshly-measured families produced duplicate model IDs. Fixed same day (post-blend, admitted-rows supersede) with regression tests.
- 2026-08-20 ~13:00Z — routing — orchestrator declared "kimi dead / no OpenAI key / codex deleted" from single-credential probes; live availability.json showed 3 kimi creds up, codex lanes up (proven), kilo sanctioned. Root cause: never consulted the canonical Pushing Dispatch install at ~/.local/share/pushing-dispatch/.
