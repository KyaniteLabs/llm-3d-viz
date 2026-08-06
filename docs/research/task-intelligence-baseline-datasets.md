# Research: public task↔intelligence / capability-threshold datasets

**Ticket:** Forgejo #129 — Research: public task↔intelligence / capability-threshold datasets (current, large, sourced)  
**Map:** #128 MAP: intelligence-floor decision mode + atlas AI  
**Date researched:** 2026-08-05  
**Scope:** public sources that could support a *theoretical* baseline for “how much model intelligence / capability a task class needs.” No product code.

---

## Ticket resolution summary

**Finding (blunt):** There is **no native public product dataset** of the form `task_class → minimum_intelligence_floor` (e.g. “repo bugfix needs AA Index ≥ 45”). What exists at scale is almost entirely **model × benchmark matrices** (and a few **task-difficulty × model success** matrices). Any “intelligence floor” for this product must be **inverted or curated** from those matrices, then **overridden by the user** for reliability and domain fit.

**Closest scientific construct:** METR **task-completion time horizons** — logistic fit of success vs human task duration → p50/p80 horizon per model. That is the only widely cited, continuously updated public method that answers “what difficulty can this model clear at reliability R?” rather than only “what aggregate score did it get?”

**Recommended baseline package (minimal, honest):**

1. **Keep AA Intelligence Index (+ component scores where available) + cost/time per Index task** as the product’s intelligence/cost axes (already aligned with SPEC).  
2. **Layer METR horizons** as an optional *software/agent autonomy* floor axis (duration @ p50/p80), not as a universal IQ floor.  
3. **Join Epoch AI Benchmarking Hub CSV** for multi-benchmark model×eval coverage under CC-BY.  
4. **Domain boards as floor *proxies* only:** SWE-bench Verified/Pro, Terminal-Bench, LiveCodeBench, Aider polyglot, GPQA Diamond, HLE, GAIA levels, Arena category Elo.  
5. **User floor stays authoritative** for reliability target, task taxonomy, and acceptance criteria. Ship theoretical baselines as *suggested defaults with source + confidence*, never as ground truth.

**Do not claim:** that any public source ships “min intelligence for task class X” as a product field.

---

## 1. Question and method

### Product question (from #128 / SPEC)

Decision mode needs a notion of **intelligence floor**: for a workload / task class, which models are “smart enough,” then rank survivors by speed/cost (and value weights). That requires either:

- **Native:** `task_class → min_capability` product data, or  
- **Invertible:** dense `model × task/benchmark` performance so we can define a threshold (e.g. pass@1 ≥ R) and read off the weakest model / lowest Index that clears it.

### Method

Primary-source scan (2026-08-05): METR, Epoch AI, Artificial Analysis methodology, SWE-bench, LiveCodeBench, Terminal-Bench, HELM, Arena/LMArena, GAIA, HLE, GPQA, Aider, Scale SEAL, OpenAI GDPval, Open LLM Leaderboard. Prefer 2024–2026 or continuously updated sources. **No invented metrics.**

### Staleness convention used below

| Tag | Meaning |
|-----|---------|
| **Live** | Continuously or frequently updated leaderboard / hub (weeks–months) |
| **Periodic** | Explicit versioned releases (e.g. TH 1.1, AA Index v4.1) |
| **Static / aging** | Fixed paper dataset; leaderboard may still refresh scores on frozen items |
| **Saturated** | Top models cluster near ceiling; weak as *ranking* signal, still usable as *minimum filter* only with caution |

---

## 2. Explicit answer: native floors vs matrices we invert

| Kind of data | Exists publicly at useful scale? | Examples |
|--------------|----------------------------------|----------|
| **Native `task → min intelligence` product table** (vendor/UI floors, “needs Index ≥ N”) | **No** | Industry blogs describe the *concept* of a capability threshold; they are not sourced multi-task product datasets. |
| **Model × benchmark score matrices** | **Yes, large** | Epoch Benchmarking Hub, AA Index + eval pages, HELM leaderboards, Open LLM Leaderboard results, Arena Elo by category |
| **Task-instance × model success** (invertible to floors) | **Yes, smaller / domain-bound** | METR runs (`task_id`, `human_minutes`, success); SWE-bench instances; Terminal-Bench tasks; LiveCodeBench problems by difficulty |
| **Ordinal task difficulty levels** | **Yes, sparse** | GAIA L1–L3; LiveCodeBench Easy/Med/Hard; METR human-minute continuum |
| **Composite “intelligence” indices** | **Yes** | AA Intelligence Index v4.1 (weighted multi-eval) |

**Conclusion for #128:** Product intelligence floors must be **derived**:

1. Choose a **benchmark or task suite** that maps to a workload label (coding, agentic ops, science QA, chat preference…).  
2. Choose a **reliability bar** R (user-owned; e.g. 50%, 80%, 90%).  
3. Find models with score ≥ R (or horizon ≥ required duration).  
4. Optionally **project** that set onto AA Index / Arena Elo / TPS / $/M already in the catalog.  
5. Present as **suggested floor**, always editable; never hard-wire as factual min-IQ for the user’s real job.

---

## 3. Candidate sources (what, size, cadence, license, floor mapping)

### 3.1 METR task-completion time horizons — **best theoretical floor construct**

| Field | Detail |
|-------|--------|
| **What it measures** | For each model/agent: human-expert task duration at which logistic regression predicts **50% or 80% success** on a suite of software / ML / cybersecurity tasks. |
| **Size** | Paper suite ~170 tasks (RE-Bench + HCAST + SWAA shorter tasks); TH 1.1 expands the suite. Public analysis: multi-model run matrices in `runs.jsonl` (task_id, human_minutes, success). Model coverage is **frontier-sparse** (not hundreds of commodity models). |
| **Update cadence** | **Live / periodic.** Live page last marked **2026-05-08**; TH 1.0 (Mar 2025), TH 1.1 (Jan 2026). METR updates when capacity allows; not every model release. |
| **License** | Paper CC BY 4.0 (arXiv); analysis repo public — confirm LICENSE in-repo before redistribution. |
| **Floor mapping** | **Strongest available invert:** for a software task of estimated human duration D and reliability R, models with horizon ≥ D are candidate “above floor.” Directly answers “how hard a *task* can this model handle?” |
| **Fails as** | Universal IQ floor; non-software domains; high-context real jobs (METR FAQ: horizons ≠ full job automation). Long horizons (>16 h) marked unreliable. Sparse catalog join to mid-tier API models. |
| **Primary URLs** | https://metr.org/time-horizons/ · https://arxiv.org/abs/2503.14499 · https://github.com/METR/eval-analysis-public · raw YAML linked from live page (`/assets/benchmark_results_1_1.yaml`) · https://epoch.ai/benchmarks/metr-time-horizons |

**Honest gap:** Time horizon is **domain-jagged** (METR cross-domain follow-ups). Do not use one software horizon as the floor for chat, vision, or RAG.

---

### 3.2 Artificial Analysis Intelligence Index + cost/time per Index task — **product-native intelligence axis**

| Field | Detail |
|-------|--------|
| **What it measures** | Weighted composite of agentic, coding, scientific reasoning, and general evals (Index **v4.1**): e.g. GDPval-AA v2, τ³-Banking, Terminal-Bench v2.1, SciCode, AA-LCR, AA-Omniscience, HLE, GPQA Diamond, CritPt. Also **Cost per Task** and **Time per Task** for Index workload. |
| **Size** | Index = 9 weighted evals; thousands of underlying items across components (e.g. HLE 2,158 text questions in AA’s suite; GPQA Diamond 198; Terminal-Bench v2.1 = 89; AA-Omniscience 6,000). **Models:** large public catalog (hundreds of endpoints/models on AA site). |
| **Update cadence** | **Live** model pages + versioned Index methodology (v4.1 documented). |
| **License** | Methodology public; **bulk raw eval dumps are not a free open matrix** like Epoch’s ZIP — product uses published per-model fields (as in this repo’s catalog join). Respect AA ToS for scraping. |
| **Floor mapping** | **Indirect.** Index is overall intelligence proxy; **component scores** (if available per model) better map task classes (coding vs science vs agents). Cost/time per task support decision charts, not floors. |
| **Fails as** | Native task→floor table. AA states Index “may not apply directly to every use case.” Component weights emphasize agents (34%). |
| **Primary URLs** | https://artificialanalysis.ai/methodology · https://artificialanalysis.ai/methodology/intelligence-benchmarking · https://artificialanalysis.ai/methodology/coding-agents-benchmarking |

**Repo alignment:** Already primary intelligence + task cost/time path (`docs/research/dataset-v0-sources.md`, wayfinder cost-per-task notes).

---

### 3.3 Epoch AI Benchmarking Hub — **largest open model×benchmark join**

| Field | Detail |
|-------|--------|
| **What it measures** | Aggregated performance of leading models on challenging benchmarks (internal + external runs). Includes series such as METR time horizons, Aider polyglot, Terminal-Bench, HLE, etc. |
| **Size** | Multi-benchmark CSV hub; companion **AI Models** DB 3,500+ models. Benchmark ZIP updated **2026-08-04** (research date). |
| **Update cadence** | **Live / continuous** (hub pages show recent update stamps). |
| **License** | **CC BY** for Epoch data (credit required). External-derived series retain original licenses (e.g. Aider / Terminal-Bench noted Apache 2.0 on Epoch’s use-this-data page). |
| **Floor mapping** | Invert model×benchmark scores with a chosen R. Best open bulk download for multi-eval baselines. |
| **Fails as** | Task-class product taxonomy; not all evals share harnesses; external series may lag official leaderboards. |
| **Primary URLs** | https://epoch.ai/benchmarks · https://epoch.ai/benchmarks/use-this-data · https://epoch.ai/data/benchmark_data.zip · https://epoch.ai/data · https://github.com/epoch-research/epochai-python/ |

---

### 3.4 SWE-bench family (Verified, Lite, Full, Multilingual, Multimodal) + Scale SWE-bench Pro / SEAL

| Field | Detail |
|-------|--------|
| **What it measures** | Resolve real GitHub issues in repos (patch must pass tests). Verified = human-filtered **500** instances; Full **2294**; Multilingual **300**; etc. Pro (Scale): longer-horizon / harder public sets + private sets. |
| **Size** | Hundreds–thousands of **task instances**; model×harness leaderboards. Official Verified board uses mini-SWE-agent for fairer model comparison. |
| **Update cadence** | **Live** leaderboards; dataset versions relatively stable with new agent submissions. |
| **License** | Dataset/code public via SWE-bench project; Pro public set on HF `ScaleAI/SWE-bench_Pro` — check each package LICENSE. |
| **Floor mapping** | **Coding / SWE agent floor proxy:** models below a chosen % resolved are “under floor” for repo-repair workloads. Cost/traj sometimes published (e.g. $/instance). |
| **Fails as** | General intelligence; harness confounds (vendor scaffold vs SEAL standardized). Verified approaching **saturation** at frontier in 2026 → better as high floor for mid models than as top-end ranker. Pro less saturated. |
| **Primary URLs** | https://www.swebench.com/ · https://openai.com/index/introducing-swe-bench-verified/ · https://labs.scale.com/leaderboard/swe_bench_pro_public · https://huggingface.co/datasets/ScaleAI/SWE-bench_Pro · https://arxiv.org/abs/2509.16941 (Pro paper, if citing Pro) |

---

### 3.5 LiveCodeBench

| Field | Detail |
|-------|--------|
| **What it measures** | Contamination-resistant coding: new contest problems over time (LeetCode/AtCoder/Codeforces); scenarios include generation, self-repair, execution, test output prediction. Difficulty splits Easy/Med/Hard. |
| **Size** | Continuously growing; paper/site started ~400 problems (May 2023–2024 window); AA methodology cites **315** in its LiveCodeBench row; leaderboards use time-windowed problem sets (hundreds). Multi-model leaderboards. |
| **Update cadence** | **Live** (rolling problem harvest). |
| **License** | Dataset on HF (`livecodebench/*`); paper arXiv:2403.07974 — check HF dataset cards. |
| **Floor mapping** | Algorithmic coding floor; Hard split ≈ higher intelligence demand. Time-window evals reduce contamination false floors. |
| **Fails as** | Repo-level SWE; agent tool-use; non-code workloads. |
| **Primary URLs** | https://livecodebench.github.io/ · https://livecodebench.github.io/leaderboard.html · https://github.com/LiveCodeBench/LiveCodeBench · https://huggingface.co/datasets/livecodebench/code_generation_lite · https://arxiv.org/abs/2403.07974 |

---

### 3.6 Terminal-Bench (v2.0 / v2.1)

| Field | Detail |
|-------|--------|
| **What it measures** | Agentic performance in real terminal environments (SE, sysadmin, data, security, etc.); verified task end-state tests. v2.0 = **89** hard curated tasks; leaderboards track agent×model accuracy. |
| **Size** | 89 core tasks (2.0); leaderboards with **100+** agent/model entries (v2.0 page). Included in **AA Intelligence Index v4.1** (weight 16% coding bucket). |
| **Update cadence** | **Live** leaderboard + versioned datasets (2.0 paper Jan 2026; 2.1 refresh referenced by AA). |
| **License** | Epoch notes Terminal-Bench leaderboard data under **Apache 2.0** when redistributed via Epoch; project at tbench.ai / harbor-framework. |
| **Floor mapping** | Strong **agentic terminal / DevOps / SWE-in-shell** floor proxy. Human time estimates exist in paper methodology (useful for METR-like thinking). |
| **Fails as** | Chat UX; pure knowledge QA; vision. Agent harness quality confounds model-only floors. |
| **Primary URLs** | https://www.tbench.ai/ · https://www.tbench.ai/leaderboard/terminal-bench/2.0 · https://arxiv.org/html/2601.11868v1 · https://github.com/harbor-framework/terminal-bench |

---

### 3.7 Aider polyglot

| Field | Detail |
|-------|--------|
| **What it measures** | LLM edits source files to solve **225** hard Exercism exercises across C++, Go, Java, JS, Python, Rust; primary metric pass rate after second attempt. |
| **Size** | 225 exercises × multi-model public leaderboard (dozens of models; not thousands of models). |
| **Update cadence** | **Periodic / live** leaderboard page as models are re-run. |
| **License** | Epoch attributes Aider polyglot series **Apache 2.0**. |
| **Floor mapping** | Multi-language **edit/apply coding** floor (pair-programming style), complementary to SWE-bench. |
| **Fails as** | Full repo agents; large-scale model coverage; general IQ. |
| **Primary URLs** | https://aider.chat/docs/leaderboards/ · https://aider.chat/2024/12/21/polyglot.html · https://epoch.ai/benchmarks/aider-polyglot |

---

### 3.8 GAIA (General AI Assistants)

| Field | Detail |
|-------|--------|
| **What it measures** | Tool-using assistant questions needing reasoning, web, multimodality; **3 difficulty levels** (L1 breakable by strong LLMs; L3 large capability jump). |
| **Size** | **>450** questions; public dev + private-answer test; HF gated dataset. Leaderboard on HF Spaces. |
| **Update cadence** | Dataset **static/aging** (2023 paper; HF format update Oct 2025); **leaderboard live** via submissions. |
| **License / access** | Gated HF dataset; no-reshare contamination terms — not bulk-redistributable. |
| **Floor mapping** | **Explicit ordinal floors** (L1/L2/L3) for agentic tool-use — closest *taxonomic* floor labels in public data. |
| **Fails as** | Large volume; open bulk matrix; pure coding or pure chat. Level ≠ continuous intelligence index. |
| **Primary URLs** | https://huggingface.co/datasets/gaia-benchmark/GAIA · https://huggingface.co/spaces/gaia-benchmark/leaderboard · https://arxiv.org/abs/2311.12983 |

---

### 3.9 Humanity’s Last Exam (HLE)

| Field | Detail |
|-------|--------|
| **What it measures** | Expert-authored hard closed-ended academic questions (math, sciences, humanities, etc.) to fight benchmark saturation. |
| **Size** | **2,500** finalized questions (public set; private holdout). AA uses **2,158** text-only for Index. |
| **Update cadence** | Dataset finalized **2025-04**; scores **live** on Scale SEAL + AA + Epoch. |
| **License** | Public questions via CAIS/Scale; HF `cais/hle` — check card terms. |
| **Floor mapping** | High **scientific/academic reasoning** floor; low scores still differentiate frontier. |
| **Fails as** | Everyday product tasks; coding agents; soft skills. Overkill as chat floor. |
| **Primary URLs** | https://agi.safe.ai/ · https://labs.scale.com/leaderboard/humanitys_last_exam · https://huggingface.co/datasets/cais/hle · https://arxiv.org/abs/2501.14249 · https://epoch.ai/benchmarks/hle |

---

### 3.10 GPQA Diamond

| Field | Detail |
|-------|--------|
| **What it measures** | Graduate-level “Google-proof” science MCQs; Diamond = hardest **198** questions. |
| **Size** | Full GPQA **448**; Diamond **198**. Ubiquitous on AA Index and third-party boards. |
| **Update cadence** | Dataset **static (2023)**; model scores **live**. |
| **License** | HF `Idavidrein/gpqa` (+ passworded original release). |
| **Floor mapping** | Scientific reasoning floor; human expert ~65% vs non-expert ~34% anchors difficulty. |
| **Fails as** | Coding/agent floors; may **saturate** at top frontier over time (still useful mid-tier filter). |
| **Primary URLs** | https://arxiv.org/abs/2311.12022 · https://huggingface.co/datasets/Idavidrein/gpqa · https://github.com/idavidrein/gpqa · https://artificialanalysis.ai/evaluations/gpqa-diamond |

---

### 3.11 Arena / LMArena (Chatbot Arena) category Elo

| Field | Detail |
|-------|--------|
| **What it measures** | Blind human preference battles → Elo; **category** boards (coding, math, creative writing, vision, etc.). |
| **Size** | Text Arena order of **millions of votes**, **hundreds of models** (e.g. ~7.5M votes / 385 models cited on arena.ai text board snapshot during research). Preference datasets released in slices (e.g. 100k human preference). |
| **Update cadence** | **Live**. |
| **License** | Leaderboard public; battle data releases on HF with their terms; commercial use restrictions may apply — verify before shipping. |
| **Floor mapping** | **Preference / UX floor proxy** by category — closest large-scale “task class” labels from real user prompts. Not objective correctness. |
| **Fails as** | Objective capability threshold; sensitive to sampling bias (“Leaderboard Illusion” critiques). Elo ≠ AA Index. |
| **Primary URLs** | https://arena.ai/leaderboard · https://arena.ai/leaderboard/text · https://huggingface.co/spaces/lmarena-ai/arena-leaderboard · https://arxiv.org/html/2504.20879v1 |

---

### 3.12 HELM (Stanford CRFM)

| Field | Detail |
|-------|--------|
| **What it measures** | Multi-scenario, multi-metric evaluations (capabilities, safety, domain boards). Classic paper: 42 scenarios / 30 models densely evaluated; living leaderboards since. |
| **Size** | Many scenarios × models; raw prompts/completions historically released for transparency. |
| **Update cadence** | **Live** flagship boards (Capabilities, Safety, VHELM, domain). |
| **License** | Open evaluation framework (GitHub `stanford-crfm/helm`); check scenario dataset licenses. |
| **Floor mapping** | Scenario-level matrices → per-use-case floors with multi-metric (accuracy, robustness, toxicity…). |
| **Fails as** | Single intelligence number; some classic scenarios **saturated/aged** relative to 2026 agent benchmarks. |
| **Primary URLs** | https://crfm.stanford.edu/helm/ · https://github.com/stanford-crfm/helm · https://arxiv.org/abs/2211.09110 |

---

### 3.13 OpenAI GDPval (+ AA GDPval-AA)

| Field | Detail |
|-------|--------|
| **What it measures** | Economically valuable occupational tasks (44 occupations, multi-sector) with deliverables/rubrics. AA runs GDPval-AA v2 with agent harness + Elo vs human expert anchor (1000). |
| **Size** | AA: **220** tasks in Index table; HF `openai/gdpval` public gold set (order of hundreds of structured tasks). |
| **Update cadence** | Dataset release + AA Index integration (**periodic** methodology). |
| **License** | HF dataset terms for `openai/gdpval`. |
| **Floor mapping** | Rare **occupation-linked** task set — promising for “real work” floors, but scores are agent Elo / rubric, not a published min-Index table. |
| **Fails as** | Ready-made product floors; expensive to re-run; judgment-based grading variance. |
| **Primary URLs** | https://huggingface.co/datasets/openai/gdpval · https://arxiv.org/abs/2510.04374 · AA methodology GDPval-AA section |

---

### 3.14 Open LLM Leaderboard (Hugging Face) — **open-weight matrix (aging product relevance)**

| Field | Detail |
|-------|--------|
| **What it measures** | Open models on fixed eval suites (v2: harder tasks e.g. MMLU-Pro, GPQA, MATH, IFEval, BBH historically). |
| **Size** | Thousands of model result rows in HF datasets (`open-llm-leaderboard/results`, `contents`). |
| **Update cadence** | Was high-volume; community trust / contamination debates; treat as **aging** for 2026 frontier closed models (mostly open-weight coverage). |
| **License** | Results datasets on HF — typically research-friendly; verify card. |
| **Floor mapping** | Invert open-model×benchmark for self-host floors. |
| **Fails as** | Closed API catalog (core of this product); contamination history. |
| **Primary URLs** | https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard · https://huggingface.co/datasets/open-llm-leaderboard/results · https://huggingface.co/open-llm-leaderboard |

---

### 3.15 Scale SEAL multi-board hub

| Field | Detail |
|-------|--------|
| **What it measures** | Expert-driven leaderboards: HLE, SWE-bench Pro, others under SEAL branding. |
| **Size** | Per-board (see HLE 2500; Pro public hundreds of instances). |
| **Update cadence** | **Live**. |
| **License** | Leaderboard public; datasets vary (Pro public vs private). |
| **Floor mapping** | High-quality expert floors for frontier; limited free bulk dump vs Epoch. |
| **Primary URLs** | https://labs.scale.com/leaderboard · specific boards linked above |

---

## 4. How inversion to “min intelligence floor” works (and fails)

### Workable inversion patterns (honest)

1. **Score threshold inversion**  
   `floor(task) = min { Index(m) | score(m, benchmark_b) ≥ R }` over models m in a joinable set.  
   - Requires: dense scores on b, join keys to catalog Index, chosen R.  
   - Fails if: sparse scores, harness mismatch, saturated benchmark, Index and b uncorrelated for that domain.

2. **METR horizon inversion**  
   `capable(m, D, R) ⇔ horizon_R(m) ≥ D`.  
   - Best formal match to “task difficulty floor.”  
   - Fails if: task not software-like; D unknown; model not on METR board.

3. **Ordinal level gates**  
   GAIA L2/L3, LCB Hard — discrete product presets (“agentic hard”).  
   - Fail: coarse, few levels, not Index-native.

4. **Preference floors**  
   Arena category Elo ≥ user bar.  
   - Fail: preference ≠ correctness; gaming/sampling critiques.

### What is **not** supported by public data

- A single official mapping **workload_label → AA Index minimum**.  
- 99% reliability horizons (METR FAQ: data-hungry / sensitive).  
- Floors that ignore **scaffold, tools, context, and effort settings** (reasoning effort changes effective intelligence).  
- Claiming vendor marketing “best for coding” as dataset evidence.

### Industry “capability threshold” language

Product blogs describe the right **decision theory** (once past threshold, buy cheapest that clears it) — e.g. general LLM selection guides — but those pages are **not** primary multi-task datasets and must not be cited as empirical floor tables.

---

## 5. Recommended minimal baseline package for this product

### Ship as theoretical defaults (sourced, versioned, confidence-tagged)

| Layer | Source | Role in intelligence-floor mode |
|-------|--------|----------------------------------|
| **L0 — Catalog IQ** | AA Intelligence Index v4.1 + optional component scores | Continuous intelligence axis; primary join key |
| **L0b — Economics of IQ tasks** | AA cost/time per Index task | Decision charts, not floors |
| **L1 — Open multi-eval matrix** | Epoch Benchmarking Hub CSV (CC-BY) | Bulk invert for multi-benchmark presets |
| **L2 — Software autonomy** | METR TH 1.1 horizons + public runs | Duration@p50/p80 presets for “agentic SWE” |
| **L3 — Domain coding** | SWE-bench Verified (fair harness) + LiveCodeBench + Aider + Terminal-Bench | Coding / terminal agent presets |
| **L4 — Hard knowledge** | GPQA Diamond + HLE | Science / expert-QA presets |
| **L5 — Agentic ordinal** | GAIA levels | Coarse agent tool-use presets |
| **L6 — Preference** | Arena category Elo | Chat/coding *preference* overlay only |

### Preset sketch (illustrative inversion policy — **not** measured product truth)

These are **policy templates** for implementers, not published min-Index facts:

| Product task class | Proxy suite | Suggested default reliability R | Notes |
|--------------------|-------------|----------------------------------|-------|
| Interactive chat | Arena overall / creative writing Elo; optional AA Index mid band | User Elo bar | Preference-heavy |
| Algorithmic coding | LiveCodeBench (Hard) or Aider polyglot | pass@1 or pass_rate_2 ≥ 0.5–0.7 | User sets bar |
| Repo repair agent | SWE-bench Verified / Pro (fixed harness) | % resolved ≥ user bar | Prefer SEAL/official harness |
| Terminal agent | Terminal-Bench 2.x | accuracy ≥ user bar | Scaffold confounds |
| Long SWE autonomy | METR horizon | p50 or p80 ≥ estimated human minutes | Best formal floor |
| Science QA | GPQA Diamond / HLE | accuracy ≥ user bar | High ceiling |
| Tool-using assistant | GAIA level | must pass chosen level rate | Ordinal |

**Implementation rule:** store `source_url`, `benchmark_version`, `reliability_R`, `as_of_date`, `confidence: low|med|high`. If join coverage < threshold models, **do not show a numeric floor** — fall back to user-only.

### What must stay **user-floor-only**

1. **Reliability target** (50% vs 90% “production”).  
2. **Real task definition** (messy, multi-hour, high-context work ≠ benchmark item).  
3. **Scaffold / tools / RAG / MCP** choices (change effective capability more than small Index deltas).  
4. **Safety, policy, latency SLOs, data residency** — orthogonal to intelligence floors.  
5. **Any claim that “your Jira ticket needs Index ≥ 52”** without in-domain eval.  
6. **Effort / reasoning mode** selection — multi-effort models move on the plot; floors must be effort-scoped if used.

### Explicit non-goals for baseline package

- Re-running full METR / SWE / HLE in-house (SPEC non-goal: not operating our own eval farm for v0/v1).  
- Pretending Index components equal user task classes 1:1.  
- Auto-filtering catalog so hard that empty stages look like data bugs (prefer dim/warn over hard exclude without user consent).

---

## 6. Gaps and risks (do not paper over)

| Gap | Why it matters |
|-----|----------------|
| **No native task→min-IQ product data** | Core ticket answer; floors are constructed |
| **Harness confounds** | Same model, different agent → different “floor” |
| **Sparse METR coverage** | Can’t floor most catalog models via horizons alone |
| **Saturation** | MMLU-class / even SWE-Verified top cluster → weak ranking, weak high-end floors |
| **Contamination** | LiveCodeBench exists because older code benches overfit |
| **Jagged capabilities** | Strong math, weak tools (or reverse) — one Index floor lies |
| **Domain mismatch** | METR software hours ≠ legal drafting hours (GDPval closer, still not floors) |
| **License / ToS** | Epoch CC-BY easy; AA/Arena/HF gated sets need care |
| **Temporal drift** | Floors expire as models improve; need `as_of` and refresh |
| **Effort ladders** | Floor without effort is incomplete for reasoning models |

---

## 7. Source index (primary links)

| Source | URL |
|--------|-----|
| METR time horizons live | https://metr.org/time-horizons/ |
| METR paper | https://arxiv.org/abs/2503.14499 |
| METR analysis + data | https://github.com/METR/eval-analysis-public |
| Epoch Benchmarking Hub | https://epoch.ai/benchmarks |
| Epoch use / download / license | https://epoch.ai/benchmarks/use-this-data |
| Epoch METR series | https://epoch.ai/benchmarks/metr-time-horizons |
| AA methodology | https://artificialanalysis.ai/methodology |
| AA Intelligence Index methodology | https://artificialanalysis.ai/methodology/intelligence-benchmarking |
| SWE-bench leaderboards | https://www.swebench.com/ |
| Scale SEAL hub | https://labs.scale.com/leaderboard |
| SWE-bench Pro public | https://labs.scale.com/leaderboard/swe_bench_pro_public |
| LiveCodeBench | https://livecodebench.github.io/ |
| LiveCodeBench paper | https://arxiv.org/abs/2403.07974 |
| Terminal-Bench | https://www.tbench.ai/ |
| Terminal-Bench 2.0 paper | https://arxiv.org/html/2601.11868v1 |
| Aider polyglot leaderboard | https://aider.chat/docs/leaderboards/ |
| GAIA dataset | https://huggingface.co/datasets/gaia-benchmark/GAIA |
| GAIA paper | https://arxiv.org/abs/2311.12983 |
| HLE site | https://agi.safe.ai/ |
| HLE paper | https://arxiv.org/abs/2501.14249 |
| HLE HF | https://huggingface.co/datasets/cais/hle |
| GPQA paper | https://arxiv.org/abs/2311.12022 |
| GPQA HF | https://huggingface.co/datasets/Idavidrein/gpqa |
| Arena text leaderboard | https://arena.ai/leaderboard/text |
| HELM | https://crfm.stanford.edu/helm/ |
| HELM paper | https://arxiv.org/abs/2211.09110 |
| OpenAI GDPval HF | https://huggingface.co/datasets/openai/gdpval |
| Open LLM Leaderboard | https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard |
| Open LLM results dataset | https://huggingface.co/datasets/open-llm-leaderboard/results |

---

## 8. Suggested follow-ups (out of scope for this ticket)

1. Prototype join: Epoch CSV ∩ this repo’s model catalog IDs → coverage % for 3–5 preset suites.  
2. Define product enum `task_class` ↔ proxy suite table (data config, not hard-coded science claims).  
3. UI: floor slider = **user R + optional suggested default** with citation chip.  
4. Track AA component fields if they appear in public model JSON (coding vs science floors without re-eval).  
5. Do **not** close #128 solely on this note — map still needs product decision on UX of floors.

---

*End of research note. No product code shipped. Forgejo issue not closed by this writeup (parent owns comment/close).*
