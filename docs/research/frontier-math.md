# Frontier math: 3D Pareto ridge + value-score normalization

**Ticket:** Frontier math — 3D Pareto ridge + value-score normalization
**Status:** resolved (pinned math, pre-build)
**Date:** 2026-08-01
**Scope:** exact definitions, formulas, algorithm sketches, and edge-case policy for (a) the Pareto "ridge" filament, (b) the tunable value-score, (c) the threshold-sweep ignition order. Display/rendering concerns are out of scope except where they constrain the math.

Dataset scale assumed throughout: n ≈ 20–40 models, curated static dataset (SPEC §4 D3). Every complexity note below is dominated by rendering, not math — the recommendations optimize for *correctness and legibility*, not asymptotics.

---

## 1. Pareto dominance

### 1.1 Space: linear, always

Dominance is computed on **raw linear values** (tps, $/M, intelligence index). Log is a display-only transform applied at the plotting layer.

Two justifications:

1. **Invariance (why it wouldn't change the answer anyway):** log10 is strictly monotone, so the dominance *relation* over strictly positive values is identical in linear or log space. The frontier set cannot change under any per-axis strictly monotone transform. The rule is "compute in linear" not because log would break it, but because the linear values are the source of truth and the moment you mix spaces (e.g. one axis logged during a refactor) you get silent nonsense.
2. **Robustness:** log is undefined for zero/negative values. Cost has a legitimate zero case (free/open models — §5.3) and nulls (§5.2). Keeping all math in linear space and pushing `log10` to the render transform confines the singularity handling to one place.

### 1.2 The rule, exactly

Each model is a point p = (s, c, q) ∈ ℝ³ with:

| Axis | Variable | "Better" means | Unit (schema §5) |
|---|---|---|---|
| Speed | s = `tps` | **maximize** (higher tps) | output tokens/sec |
| Cost | c = `blended_price_per_M` | **minimize** (lower $/M) | USD per 1M tokens, AA 7:2:1 blend |
| Intelligence | q = `aa_intelligence_index` | **maximize** (higher index) | AA Intelligence Index |

**Dominance.** Point *a* dominates point *b* (write a ≻ b) iff:

```
a.s ≥ b.s  AND  a.c ≤ b.c  AND  a.q ≥ b.q   AND   (a.s, a.c, a.q) ≠ (b.s, b.c, b.q)
```

i.e. *a* is at least as good as *b* on **all three** axes and **strictly better on at least one**. (Equivalently: map cost to utility u = −c and read everything as maximization; the formulation above is kept per-axis so implementers can't flip a sign wrong.)

**Frontier.** The Pareto frontier (skyline, non-dominated set, first Pareto layer) is:

```
F = { p ∈ P : ∄ p' ∈ P with p' ≻ p }
```

By definition F is **weight-independent**. This matters for §5.4: slider weights cannot change F; they change which member of F (or of P) is the *weighted optimum*.

Canonical references: Kung, Luccio & Preparata, "On finding the maxima of a set of vectors," *J. ACM* 22(4):469–476, 1975 (O(n log n) for d = 2, 3); Börzsönyi, Kossmann & Stocker, "The Skyline Operator," ICDE 2001.

---

## 2. From frontier point-set to ridge polyline

### 2.1 Shape reality check

A 3-objective Pareto frontier is in general a 2-manifold (a surface), not a curve. With only 3 axes and real LLM data, the frontier is *almost* a curve — speed, cost, and intelligence are strongly correlated across models — but it can kink or branch (e.g. a cheap-and-fast-but-dumb point and a cheap-and-smart-but-slow point both surviving at the same cost). DESIGN-SYSTEM §7 already locked **ridge, not surface**; the ordering below makes that honest.

### 2.2 Ordering strategy (locked)

Order F by a **lexicographic key**: primary cost ascending, tiebreak intelligence ascending, tiebreak speed descending.

```
ridge = sort(F, key = p ↦ (p.c, p.q, −p.s))
```

Why this is right:

- Along a real cost↔intelligence tradeoff, cost-ascending ≈ intelligence-ascending, so the polyline reads as a journey from "cheap commodity" to "frontier flagship" — the natural narrative for the threshold-sweep.
- The tiebreaks make the order **total and deterministic** even when two frontier points share a price (common: same open model, different providers at similar prices). Determinism matters: the same dataset must always produce the same ridge and the same sweep order (diff-able, test-able, video-reproducible).
- Where the frontier genuinely branches (non-monotone segment in the s–q plane), the polyline takes a visible kink. That kink is *data*, not a defect — it is exactly the interesting non-tradeoff structure a smooth curve would hide.

### 2.3 Smoothing: none (locked)

**Straight line segments (chords) between consecutive ridge points. No spline, no Bézier, no moving average.**

- Any smoother invents points on the "frontier" that correspond to no real model — and a smoothed bulge can dip into dominated space or arc outside the data's convex support, i.e. it can *lie* about the tradeoff.
- Straight chords are the maximal honest statement: "these two real models are both efficient; everything on the segment is just the visual connective tissue." In a decision tool (SPEC §2 goal 1) honesty outranks prettiness; the filament aesthetic (DESIGN-SYSTEM) carries the drama.
- Staged ignition (§2.4) gives the sweep its organic feel, so the geometry doesn't have to.

Acceptable micro-exception (visual only, no math change): per-segment **corner rounding radius ≤ 2 px in screen space** at render time, if a render pass shows hard vertex angles reading as artifacts at typical orbit angles. This never moves vertices and is a pure stroke style.

### 2.4 Threshold-sweep ignition order (locked)

Ignite the ridge in **polyline order: cheapest → smartest** (low cost/low intelligence end first, flagship end last). Points and segments light as one staged sequence:

- Sweep budget: 400 ms total (`--sweep-dur: 400ms`, DESIGN-SYSTEM).
- With k ridge points, stage i ∈ [0, k) lights at t_i = 400ms × i / k; segment i→i+1 ignites between t_i and t_{i+1}. k is small (typically 5–12 for n = 20–40), giving ~35–80 ms per stage — staggered but not sluggish.
- On a **re-weight event**, the sweep re-fires in the *new* ignition order (see §5.4: the order key is the value-score rank, so slider changes visibly re-route the sweep).
- `prefers-reduced-motion`: collapse to instant full-ridge highlight, per DESIGN-SYSTEM.

Note the deliberate split: the **geometry** of the ridge is weight-independent (§1.2), but the **ignition order** is weight-dependent. Default (no slider interaction yet) ignition order = polyline order (cheapest→smartest); after any slider interaction, ignition order = ascending value-score rank (lowest-scored frontier point first, the current weighted optimum last — the optimum is the payoff frame of the animation).

### 2.5 Algorithm sketch

```
function frontier(P):                       # O(n²) pairwise — right choice at n ≤ ~200
    F = []
    for a in P:
        dominated = false
        for b in P, b ≠ a:
            if b.s ≥ a.s and b.c ≤ a.c and b.q ≥ a.q
               and (b.s, b.c, b.q) ≠ (a.s, a.c, a.q):
                dominated = true; break
        if not dominated: F.append(a)
    return F

function ridge(F):                          # O(k log k), k = |F|
    return sort(F, key = p ↦ (p.c, p.q, −p.s))

function ignition_order(F, weights, scores):# O(k log k)
    if weights untouched: return ridge(F)                       # cheapest → smartest
    else: return sort(F, key = p ↦ scores[p.id])                # worst → weighted optimum
```

Complexity: O(n²) = 1,600 dominance comparisons at n = 40 — microseconds; re-runnable every frame if ever needed (it won't be: recompute once per dataset load and per filter/slice change). The Kung–Luccio–Preparata divide-and-conquer algorithm achieves O(n log n) in 3D and is the cited upgrade path if n ever grows past ~10⁴ (live-data era, SPEC §8 v2); adopting it now would be complexity theater.

---

## 3. Value-score normalization

### 3.1 The composite

Normalized per-axis scores ŝ, ĉ, q̂ ∈ [0, 1] (1 = best), slider weights w = (w_speed, w_cost, w_intel) ≥ 0:

```
W = w_speed + w_cost + w_intel
score(p) = ( w_speed·ŝ(p) + w_cost·ĉ(p) + w_intel·q̂(p) ) / W          if W > 0
score(p) = ( ŝ(p) + ĉ(p) + q̂(p) ) / 3                                 if W = 0  (all sliders at 0 → equal weights)
```

- Sliders are raw 0–10 in the UI; **normalize to sum-to-1 at the composite layer** (the `/ W` above), not by constraining sliders. Users think "turn up cost," not "rebalance a simplex"; dividing by W gives them that while keeping score ∈ [0, 1].
- Weighted optimum: `p* = argmax_p score(p)`, computed over **all n models, not just F** — with normalized scores a non-frontier point can't win (a dominator beats it on every term), but computing over P is simpler and proves that property empirically in tests rather than assuming it.

### 3.2 Normalization candidates

| Method | Formula (speed, maximize) | Heavy-tail behavior | Outlier sensitivity (n=20–40) | Magnitude preserved | Bounded |
|---|---|---|---|---|---|
| **log-min-max** | (log s − min log s) / (max log s − min log s) | Good — log tames lognormal-ish tails | Moderate — extremes set the scale, but log shrinks their pull | **Yes (ratios)** — "10× cheaper" reads as a real gap | [0,1] |
| percentile / rank | rank(s)/(n−1), ascending | Excellent — immune by construction | None | **No** — 10× gap ≈ 1.1× gap if adjacent in rank | [0,1] |
| z-score | (s − μ)/σ | Poor — σ inflated by the tail; skew breaks symmetry | High | Yes, but unbounded and asymmetric | No (−∞, ∞) |

### 3.3 Recommendation: log-min-max in display space (locked)

**Normalize each axis with min-max in the same space the axis is plotted in**: log10 for speed and cost (heavy-tailed: price spans >10³× and tps ~10²× across the field), linear for the intelligence index (already a bounded, roughly uniform 0–100-style index — logging it would distort).

```
ŝ(p) = (log10 p.s − log10 s_min) / (log10 s_max − log10 s_min)
ĉ(p) = (log10 c_max − log10 p.c) / (log10 c_max − log10 c_min)     # direction flipped: minimize
q̂(p) = (p.q − q_min) / (q_max − q_min)
```

with s_min, s_max, c_min, c_max, q_min, q_max taken over the **currently visible (post-filter) dataset** — see the note below.

Why this over the alternatives:

1. **Ratio semantics survive.** Cost and speed are inherently multiplicative ("this model is 12× cheaper"). Rank normalization throws exactly that away — under rank, a 10× price gap and a 1.05× gap both collapse to one rank step, so the value-score would systematically misprice the axis users care most about. z-score keeps magnitude but is unbounded and skew-broken on this data.
2. **Heavy tails are handled by the log, not by rank.** With lognormal-ish cost/speed, log-min-max ≈ min-max on near-Gaussian values — the regime where min-max is fine.
3. **Matches the visual.** The score geometry and the plot geometry share a space, so the value-score panel and the 3D stage tell the same story. (Percentile would also be monotone-equivalent on the plot, since the axes are display-only — but the *score* is a number users read, and there magnitude must be real.)

Known weakness (acknowledged, mitigations pinned): with n = 20–40, one extreme model (e.g. a 2,000 tps specialized inference endpoint) compresses everyone else's ŝ into the bottom half. Mitigations, in order of preference: (a) accept it — it is true that nothing else is close; (b) winsorize at the 5th/95th percentile *of the current dataset* with the clamped value still displayed as its true number (axis tick shows real value); (c) offer percentile/rank as a user-toggleable "robust scoring" mode in v1+. v0 ships (a) with the toggle (c) on the roadmap. Do **not** silently winsorize in v0.

**Where min/max come from:** computed over the *visible* set (after provider/modality/context slicing), so scores re-normalize when the user filters — the score must always answer "best of what I'm looking at," not "best of everything." This makes score values filter-dependent; that is intended, and the URL/state model (SPEC §5) must record the filter set alongside weights for a shareable score to be reproducible.

### 3.4 Score ties

Deterministic tiebreak on equal composite scores: higher q̂, then lower cost (higher ĉ), then provider name alphabetical. Determinism required for the same reasons as §2.2.

---

## 4. Workload preset weight triples

Defaults as (w_speed, w_cost, w_intel), already sum-to-1. These are starting points the sliders override, not claims of truth.

| Preset | w_speed | w_cost | w_intel | One-line justification |
|---|---|---|---|---|
| coding | 0.25 | 0.15 | 0.60 | Wrong code costs engineer-hours, so quality dominates; tokens are cheap relative to dev time. |
| chat | 0.35 | 0.30 | 0.35 | Interactive UX lives and dies on latency (TTFT/tps), while the intelligence bar is already met by mid-tier models. |
| vision | 0.15 | 0.25 | 0.60 | Multimodal accuracy varies more across models than anything else; most vision jobs are batch, so speed barely matters. |
| RAG | 0.20 | 0.55 | 0.25 | Volume dominates: every query re-pays for retrieved context, so per-token cost compounds over QPS and context size. |
| long-context | 0.25 | 0.45 | 0.30 | Every request burns 100k+ tokens, so price compounds per call — and long generations make throughput the UX ceiling. |

Notes:
- RAG and long-context both weight cost #1 but for different volume shapes: RAG = many small calls each carrying retrieved context (cost ∝ QPS × context); long-context = fewer calls, each enormous (cost ∝ context per call, plus speed as the wait-time proxy).
- Chat is the most balanced preset on purpose: it is the "general assistant" default and the landing state for the sliders.

---

## 5. Edge cases

### 5.1 Ties on all three axes

Two models with identical (s, c, q) — realistic: the same open weights served by two providers at matched prices — are **mutually non-dominating** (the strict-improvement clause in §1.2 fails), so both are in F.

Policy: both rows stay in the dataset and both render as points; the **ridge** dedupes to one vertex per unique (s, c, q) triple (canonical representative = first by provider name, others recorded as `aliases`) so the filament never draws a zero-length segment. Hovering the vertex lists all aliased models. In dominance tests, treat exact triple equality explicitly (floating-point: compare rounded to the dataset's published precision — tps to 0.1, price to 0.01, index to 0.1 — never raw float equality).

### 5.2 Missing values (null tps, unpublished price)

- A model missing **any** of the three axes is excluded from frontier computation and from value-scoring — a 2-axis dominance relation would be a different mathematical object and would leak wrong answers (e.g. a model with no price "dominating" everything on s and q).
- It is also **not plotted on the 3D stage** (a point needs three coordinates — no imputation, no axis-parallel "ghost" placement; fabricating a coordinate in a decision tool is worse than admitting the hole).
- It appears in a visible **"incomplete data" side list** with its known axes shown and the missing axis marked `unpublished` / `not measured`, so the dataset's coverage gaps are legible rather than silent.
- Schema: missing values are `null` with a required `null_reason` enum (`unpublished`, `not_measured`, `not_applicable`). Never `0` — see 5.3.

### 5.3 Zero / negative cost

- **Zero** is legitimate (free tiers, self-hosted open weights). `log10(0)` is undefined, so: clamp to ε = **half the smallest positive price in the current dataset** before any log transform or normalization, and mark the point with a distinct shape (per DESIGN-SYSTEM's shape-over-color rule) plus a "≤ floor" axis tick. The ε-from-data rule keeps the clamp inside the plot range without inventing an arbitrary constant.
- **Negative** price (credits/rebates artifacts) is a data error, not a market signal: quarantine the row, treat as missing (5.2), and surface it in the dataset validation report. Do not clamp negatives into the ε floor — that would launder bad data into a plausible-looking value.

### 5.4 Models optimal at one weight, dominated at another — recompute or fixed frontier? (locked: fixed frontier, re-rank everything else)

First, a precision fix on the framing: **Pareto dominance is weight-independent** (§1.2), so no point is "frontier at one weight and dominated at another." What actually moves with the sliders is the **weighted optimum** `argmax score` — a point can be the optimum under one weight triple and merely frontier (or off-frontier in score rank) under another. The design intent ("frontier visibly re-ranks on slider change") is fully satisfied without making the frontier itself weight-dependent:

- **Fixed:** the frontier set F and the ridge polyline geometry — computed once per dataset/filter state. This keeps the filament's meaning stable ("the genuinely efficient models") and avoids a geometry that twitches under every slider tick, which would destroy the calm-canvas principle (DESIGN-SYSTEM) and make the research-artifact claim indefensible.
- **Re-ranked on every weight change (all O(n) or O(k log k), run live):** (a) composite scores for all visible models; (b) the **weighted optimum marker** — the user's selected optimum, the second thing besides the frontier allowed to burn filament-white (DESIGN-SYSTEM: "filament reserved exclusively for the efficient frontier + the user's selected optimum"); (c) the sweep **ignition order** (§2.4: re-fire cheapest→smartest by *score rank*, ending on the new optimum); (d) 2D-projection highlights snapping into registration on the new optimum.
- Rejected alternative: per-weight "supported frontier" (convex-hull-supported solutions only). It would literally remove concave-region frontier points as weights move, but with n = 20–40 the support structure is sparse and jumpy, the removal events look like flicker/bugs, and it conflates "efficient" with "optimal for some nearby weight." Not v0, and probably not ever for this audience.

### 5.5 Degenerate visible sets

- **All visible points identical on an axis** (e.g. filter to one provider with a single price): the min-max denominator for that axis is 0 → define that axis's normalized score as 1.0 for all points (it carries no discriminative information) and let the other axes decide. Log this as a `degenerate_axis` warning in dev tools.
- **Fewer than 2 visible points after filtering:** frontier = the set itself; ridge and sweep degrade to a single highlighted point; UI copy must not claim "frontier of 1."

---

## 6. Where reasonable people would disagree

1. **log-min-max vs percentile/rank (§3.3).** Rank is the orthodox robust-stats answer for tiny heavy-tailed samples, and anyone with a statistics background will reach for it. We chose log-min-max for ratio semantics; the robust-scoring toggle (roadmap item (c)) is the compromise if user testing shows outlier compression confusing people.
2. **Fixed frontier vs re-computed frontier (§5.4).** If you read "frontier re-ranks on slider change" literally, you implement per-weight frontiers. We read it as "the *optimum and ordering* re-rank" and keep F fixed — more honest math and a calmer canvas, but a stakeholder who wants the *geometry itself* to move will want the supported-frontier variant. Flag for user-testing: does the moving optimum + re-ordered sweep read as "the frontier re-ranked"? If not, revisit.
3. **Ignition direction (§2.4).** Cheapest→smartest tells a "climb to the flagship" story; lighting *from the weighted optimum outward* tells a "here's your answer, now the alternatives" story. Default ignition follows polyline order pre-interaction and score-rank order post-interaction (which ends on the optimum either way); a cinema-mode variant igniting from the optimum outward is a one-line reorder worth testing in video cuts.
4. **Visible-set re-normalization (§3.3).** Re-normalizing on filter makes scores non-comparable across views ("score 0.81 of what?"). The alternative — normalize once over the full dataset — makes a filtered view's best model score 0.6, which reads worse in a recommender. We chose per-view; the URL must capture filter state to keep shared scores reproducible.

---

## References

- Kung, H. T., Luccio, F., & Preparata, F. P. (1975). [On finding the maxima of a set of vectors](https://doi.org/10.1145/321906.321910). *J. ACM* 22(4), 469–476. — O(n log n) maxima for d = 2, 3; O(n log^{d−2} n) general.
- Börzsönyi, S., Kossmann, D., & Stocker, K. (2001). The Skyline Operator. *ICDE 2001*. — skyline queries as a database primitive; dominance semantics used here.
- SPEC.md §5 (schema: tps, blended_price_per_M, aa_intelligence_index), §8 (phasing: v0 static n ≈ 20–40).
- DESIGN-SYSTEM.md §7 (ridge-not-surface, filament tokens, `--sweep-dur: 400ms`, shape-over-color, reduced-motion path).
