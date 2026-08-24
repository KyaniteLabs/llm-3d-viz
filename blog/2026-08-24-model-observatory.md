# We Built an Open-Source Model Observatory: Every LLM, Compared on Speed, Cost, and Intelligence in One 3D Chart

*Published 2026-08-24 · Kyanite Labs · 6-minute read*

**TL;DR:** The Model Observatory is a free, open-source interactive 3D visualization that plots 314 large language models on three axes — output speed (tokens/second), blended price ($/M tokens), and intelligence (Artificial Analysis Index) — so you can see the entire Pareto frontier at a glance instead of reading fifty benchmark tables. It updates itself three times a day from public data, never invents a number, and ships with a 573-test suite that makes lying structurally difficult. This post explains what it is, how the data pipeline enforces honesty, and what four independent AI vision critics taught us about shipping presentation-grade data visualization.

**Try it:** [viz.kyanitelabs.tech](https://viz.kyanitelabs.tech/) · **Fork it:** [github.com/KyaniteLabs/llm-3d-viz](https://github.com/KyaniteLabs/llm-3d-viz) (MIT)

---

## What is the Model Observatory?

The Model Observatory is an **interactive 3D LLM benchmark comparison tool**. Every model is a point in a three-dimensional space:

- **X — Cost:** blended price per million tokens (input/output weighted by real task mixes, from Artificial Analysis and OpenRouter list prices)
- **Y — Intelligence:** the Artificial Analysis Index (AA's cross-benchmark intelligence score)
- **Z — Speed:** output tokens per second

The white "filament" burning through the cloud of points is the **Pareto frontier** — the set of models where no other model is simultaneously cheaper, faster, *and* smarter. That ridge is the whole point of the visualization. Reading benchmark tables, you reconstruct that frontier in your head, badly. Here you see it: which models are on it, how crowded it has become, and which marketing claims fall off it the moment you plot them.

Three questions the observatory answers in seconds:

1. **"What's the cheapest model that's still smart enough for my task?"** — Set an intelligence floor in Decide mode; the panel shortlists eligible models ranked by cost, speed, or balance.
2. **"Is the new model actually better, or just newer?"** — Multi-effort tiers (low/medium/high reasoning) plot as labeled clusters per family, so you see what you're really buying per tier.
3. **"Open weights or closed API — what does each really cost to *use*?"** — Open-weight models appear at their hosted API prices. Open ≠ free to use, and the cost axis makes that visible instead of implied.

## The data honesty core: never invent a number

Most comparison sites fail quietly: a missing benchmark becomes a zero, a stale price becomes today's price, a vendor's claimed score gets copied into a column that implies independent measurement. The observatory is built around the opposite contract:

- **One authoritative spine.** The AA Intelligence Index, tokens/second, and time-to-first-token come from exactly one source (Artificial Analysis). No other data producer can write those fields. Ever.
- **Nulls are data.** If a model's speed hasn't been measured, the row shows null with a reason code — it joins an *awaiting measurement* annex instead of polluting the chart. When Artificial Analysis briefly un-measured Gemini 3.7 Flash's speed in August 2026, the model correctly left the main view for four days and returned when the measurement returned.
- **Per-field provenance stamps.** Every populated field carries its origin (`aa`, `aa-api`, `openrouter`, `provider`, `curated`) and kind (`measured` vs `list`). A meta-assertion in the test suite fails the build if any field lacks a stamp.
- **Preliminary data, labeled as preliminary.** When a lab announces a model before anyone measures it (GLM-5.3, Seed 2.1 Turbo, Ornith 1.5, the anonymous "Ox Alpha"), a curated row can carry the *provider-published* numbers with PRELIMINARY provenance — and auto-supersedes the moment an independent measurement exists. Vendor numbers are never mixed into measured columns.
- **Prices are real API prices.** Free promotional pricing (like Ox Alpha's launch-week $0) is flagged as non-durable, and a canary watches for price divergence between sources so repricing (three Qwen models repriced 22–60% in one August weekend) surfaces as an alert, not a silent drift.

The pipeline runs three times daily, rebuilds the dataset from scratch, records a spine-keyed diff (rename-aware, so a superseded manual row pairing with its measured successor counts as a rename, not a churn event), and deploys. 573 tests gate it. The failure modes we cared about — families silently vanishing, duplicate rows, un-gated data commits — each have a regression test named after the day they happened.

## What four AI vision critics taught us about visual QA

Getting a 3D scatter plot to presentation grade is mostly about collisions: labels overlapping ticks, ticks overlapping titles, callouts slicing through the legend. We ran an iterative fix-and-verify program where **four independent vision models** (from different vendors, one rubric) reviewed screenshots of the four key UI states, and every claim they made was adjudicated against DOM geometry measurements — the actual bounding boxes of every rendered label.

Findings from that program:

- **Harsh critics hallucinate plausibly.** Critics repeatedly "read" label collisions that the geometry proved impossible, and cited model names that weren't on screen. Roughly 40% of vision claims were refuted by measurement. Automated visual QA needs a ground-truth adjudicator, not a vote.
- **Your verifier can be vacuously true.** Our "zero tick collisions" check passed on panels that were empty — no ticks, no collisions. Every "zero X" assertion needs a denominator.
- **The ceiling is philosophy, not defects.** After every mechanical defect was fixed (verified: zero overlapping elements, zero truncated labels, zero off-canvas, across desktop, Decide, Cinema, and 390px mobile), the four critics still spread 15+ points on the same screenshots — the strictest grader wants a dashboard, the design wants an observatory. At that point more critics don't converge the score; the design owner makes one call (we raised secondary text one step, from 10px/55% opacity to 11px/70–85%) and the residual disagreement is taste, not truth.

That last point is why the project is open source: the argument "is this presentation-grade?" is only worth having when the mechanical bar is provably cleared.

## Decide mode: from chart to shortlist

The 3D stage is for orientation; **Decide mode** is for action. Set an intelligence floor (e.g., "AA Index ≥ 50"), and the panel:

1. filters to models that clear the floor with complete measurements,
2. ranks the survivors by your objective — minimum cost, maximum speed, or balanced,
3. names a shortlist with the exact trade (e.g., "GPT-5.6 Luna: Index 50.1 · $0.17/M · 169 tok/s"), and
4. syncs the whole state to the URL, so a shortlist is a link you can send.

The floor and filters also drive the stage: models below the floor dim to near-invisibility — the chart shows you what you're excluding while the panel counts exactly what you're including, and the two numbers must agree (a consistency check verifies the copy against the DOM every build).

## Fork-friendly by design

The repository is MIT-licensed and built to be adapted: swap the catalog source for your own data, change the axis metrics (the axis system is metric-mapped, not hard-coded), or re-theme the whole observatory from one token file. A forkers' guide covers the seams. The data layer is plain JSON with a documented schema and per-field provenance — if you run your own evaluation harness, you can feed it.

- **Live:** [viz.kyanitelabs.tech](https://viz.kyanitelabs.tech/)
- **Source:** [github.com/KyaniteLabs/llm-3d-viz](https://github.com/KyaniteLabs/llm-3d-viz)
- **Data sources:** [Artificial Analysis](https://artificialanalysis.ai) (API) · [OpenRouter](https://openrouter.ai) (list prices) · LMArena (Elo, CC BY 4.0)

## FAQ

**Is the Model Observatory free?**
Yes. No account, no paywall. The code is MIT open source.

**How current is the data?**
The catalog rebuilds three times daily from source APIs, plus on-demand refreshes when new models are announced. Each model row shows its data date and per-field sources.

**Why do open-weight models show prices?**
The cost axis prices *using* a model through an API — the comparable number across all models. Weights being downloadable doesn't make hosted tokens free, and conflating the two is how comparisons go wrong.

**What is the Artificial Analysis Index?**
A cross-benchmark intelligence score published by Artificial Analysis, blending expert-domain evaluations. We use it as the single authoritative intelligence axis precisely because it is one consistent methodology across all models — and we never let any other source write that field.

**Can I use my own benchmarks?**
Yes — fork the repo and point the catalog pipeline at your data. The provenance system expects you to stamp origins; it will refuse unlabeled fields.

**Does it work on mobile?**
Yes — a compact decode layer (compact axis titles, a collapsible stage key, a scrollable ranked list) ships at 390px, verified by the same screenshot-critic program as desktop.
