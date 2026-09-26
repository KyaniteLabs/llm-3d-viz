# Structural redesign analysis — llm-3d-viz

**Date:** 2026-08-05  
**Audience:** Simon (data-analyst user)  
**Scope:** Not aesthetics — **information architecture, control model, and navigation**.  
**Research window:** practices current through mid‑2026 (BI shells, progressive disclosure, multi‑dimensional viz, filter UX).

---

## 0. The product job (reframed)

You are not building a “dashboard homepage.” You are building a **selection instrument**:

> Given speed × cost × intelligence (and effort intensity), **which models stay in view**, and **how do they trade off** under my weights?

That implies two co-equal jobs that the current UI **conflates**:

1. **Set membership** — deep control of *what* is on stage (labs, families, effort, age, completeness).  
2. **Exploration** — rotate, compare, reweight, solo ladders, read metrics.

Best practice in 2025–26 BI / analytical tools: **separate “data scope” from “view exploration.”**  
Tableau / Power BI / Looker all put **filters in a dedicated, persistent context** and treat the canvas as the *consequence* of that scope — not as a peer “bento” of equal chrome.

---

## 1. Research synthesis (Aug 2026)

### 1.1 Progressive disclosure is the dominant enterprise pattern

Interaction Design Foundation (updated 2026) and enterprise UX writing agree: dashboards work when the **first layer is overview**, and advanced capability is **layered on demand**, not deleted. For power users, the advanced layer must still be **one gesture away**, not buried in five competing panels.

Implication for us: **one primary surface (the stage)**; **one primary control surface (scope)**; everything else is secondary or contextual.

### 1.2 BI tools win on “visible set is always legible”

Tableau’s filter model is explicit: filters are the **primary interaction** for focusing analysis; mark select / hover / actions are secondary. High-cardinality filters (many families) should be **search + apply**, not multi-select walls; sequential / hierarchical filtering (lab → family → effort) beats one flat list.

Power BI / modern report UX: **slicers for low-cardinality** (lab, age band), **searchable multi-select for high-cardinality** (family), **Apply** when changing many dimensions at once so the stage does not thrash mid-edit.

### 1.3 Multi-dimensional viz best practice: 3D is exploration, 2D is verification

Industry consensus (still true in 2026 guides):  
- **3D interactive** is good for *orientation* and *structure* (clusters, frontiers, effort paths).  
- **Linked 2D** (or small multiples) remains the place for *precise comparison*.  
- Putting both + a dense console on one screen without a hierarchy produces **chrome competition**, not insight.

Our SPEC already said “hybrid 3D + linked 2D.” The failure is structural: 2D projections and console fight the 3D for permanent real estate instead of being **modes** or **drawers**.

### 1.4 Analyst mental model: “filter context → visual → detail”

A data analyst’s loop is:

```
Define population → look → reweight / re-axis → isolate case → export / share
```

Not:

```
Scroll console → find nav → find advanced → reweight → lose place → open MORE → …
```

### 1.5 Immersive / 3D trend (2026)

2026 trend pieces push “immersive” 3D, but the **working** pattern for professional analysis remains: **large canvas + docked control rail / filter shelf**, not “everything always on.” Cinema mode is a presentation mode; analysis mode needs **filter shelf always reachable without covering the plot**.

---

## 2. Antagonistic analysis of *this* design (structural)

### 2.1 Current architecture (as shipped)

```
┌─────────────────────────────┬──────────────┐
│  STAGE (3D)                 │  CONSOLE     │
│  + overlay STAGE KEY        │  readout     │
│                             │  NAVIGATE    │
│                             │  weights     │
│                             │  presets     │
│                             │  axes        │
│                             │  advanced    │
│                             │  cinema      │
│                             │  MORE…       │
├─────────────────────────────┤              │
│  effort strip (conditional) │              │
├─────────────────────────────┤              │
│  3× projection “bento”      │              │
└─────────────────────────────┴──────────────┘
```

Console alone is ~800 lines and owns **membership, navigation, scoring, axes, tasks, table**. That is not an app shell; it is a **kitchen sink column**.

### 2.2 Fatal structural faults (ordered by damage)

| # | Fault | Why it hurts an analyst |
|---|--------|-------------------------|
| **S1** | **No first-class “Visible set” object** | Membership is scattered: catalog-scope in code, age/multi-effort in advanced, families in chips *and* multi-select, effort only when soloed. You cannot answer “what am I looking at?” without scanning four places. |
| **S2** | **Same column for *scope* and *score*** | Weights and “who is in view” are co-located. Changing one feels like reconfiguring the other. Analysts keep **filter context** sticky and **measures** ephemeral. |
| **S3** | **Navigation is not hierarchical** | Lab → family → effort is the natural tree. We expose flat chips + steppers + advanced multi-selects that re-implement the same tree three ways. |
| **S4** | **3D is the hero but not the only always-on surface** | Even after stage-dominant CSS, permanent projection strip + optional effort + console create a multi-zone working memory tax. |
| **S5** | **No “Apply / Edit scope” boundary** | Every checkbox re-renders the world. Power users want **edit scope → apply**, or **live for cheap dims, apply for membership**. |
| **S6** | **Dual state systems** | Session filters, URL state, catalog-scope module, multi-effort default, release floor — correct rules, **no single “scope bar”** that displays them as one sentence. |
| **S7** | **Detail is not a panel, it is pollution** | Leaderboard + readout + task ranks + table all compete. Analyst pattern: **one detail inspector** driven by selection. |
| **S8** | **Keyboard/nav help is documentation in the UI** | Key hints in the console are a smell that the primary path is non-discoverable. |

### 2.3 What is *not* the core problem

- Tokens / dark theme / filament aesthetic (fine for an instrument).  
- Having 3D at all (SPEC hybrid is sound).  
- Cloud lab + Jan 2026 floor (good **data** product decisions).  

The core problem is **shell + control hierarchy**, not color.

### 2.4 Antagonistic one-liner

> We built a **showcase stage** and then bolted on **every analytical control as permanent UI**, so the tool is neither a calm showcase nor a sharp analysis workbench.

---

## 3. Best-practice structural alternatives

### Option A — **Analysis app shell** (recommended)

Classic analytical shell, used by every serious BI tool:

```
┌──────────────────────────────────────────────────────────┐
│ TOP BAR: product · scope chip summary · search · share   │
├──────────────┬───────────────────────────┬───────────────┤
│ LEFT RAIL    │  MAIN CANVAS (3D default) │ RIGHT INSPECT │
│ (filter      │  mode: 3D | 2D pairs |    │ selection +   │
│  shelf)      │  table                    │ weights       │
│              │                           │ effort ladder │
│ Lab tree     │                           │               │
│ Family tree  │                           │               │
│ Effort       │                           │               │
│ Age / rules  │                           │               │
│ [Apply]      │                           │               │
└──────────────┴───────────────────────────┴───────────────┘
│ STATUS: N models · M families · filters as text · URL    │
└──────────────────────────────────────────────────────────┘
```

**Why it fits you**

- **Deep control** lives in one place (left filter shelf / tree).  
- **Powerful ease**: stage is huge; change membership without hunting.  
- **Selection drives detail** (right inspector), not the reverse.  
- Modes switch the *main* view without stacking three permanent visuals.

**Variants**

- Filter shelf as **left drawer** (collapsed to icons; expands over stage temporarily).  
- Weights as **bottom sheet** or inspector tab (“Score”), not permanent mid-console.

### Option B — **Workbench: table-primary + stage secondary**

Analyst-native:

1. **Filterable model table** is the truth of membership (checkbox columns, lab/family group-by).  
2. Stage is a **linked projection** of the table selection (like brushing in Observable / Tableau).  
3. Double-click row → solo family curve.

**Why it fits**

- Membership control is *literal* — every row is on/off.  
- Matches “I must have deep control of what models are displayed at all times.”  

**Risk**

- Feels less “product showcase”; more Excel/Tableau. For *your* use, that may be correct.

### Option C — **Focus + context (no permanent projections)**

- Main: only 3D.  
- Context: **one** 2D panel that swaps pair on demand (or appears on pin).  
- Effort ladder appears only in solo mode as a bottom dock.

This is closer to scientific image viewers (large viewport, tools docked).

### Option D — **Keep grid, but force a single “Scope” modal / sheet**

Minimal rewrite: one **Edit visible set** full-height sheet with tree + apply; console reduced to selection + weights. Faster to ship; less clean than A.

---

## 4. Recommended target architecture (for Simon-as-analyst)

**Adopt Option A with a strong Option B membership control inside the filter shelf.**

### 4.1 Control hierarchy (non-negotiable)

1. **Scope** (who is on stage) — lab / family / effort / age / release floor / multi-effort  
2. **Focus** (what am I looking at) — hover / pin / solo family  
3. **Measure** (how do I rank) — weights / presets / axes  
4. **Present** (cinema / share URL)

Never mix 1 and 3 in the same vertical scroll without tabs.

### 4.2 Visible-set contract (always on screen)

A single **scope bar** sentence, always visible:

> Cloud labs · since 2026-01 · multi-effort only · 3 labs · 12 families · **47 models** · [Edit]

Click **Edit** → filter shelf / drawer with:

- Hierarchical checklist: Lab ▸ Family ▸ Effort tiers  
- Search across names  
- Bulk: select all / none / invert per lab  
- **Apply** (or live apply with undo)

That is “deep control” without permanent bento noise.

### 4.3 Main canvas modes (tabs, not simultaneous equal panels)

| Mode | Purpose |
|------|---------|
| **3D** | Default exploration, effort paths |
| **2D** | One pair or 3 small multiples *in mode*, not permanent strip |
| **Table** | Membership truth + sort / multi-select |

Projections stop competing with 3D for permanent height.

### 4.4 Inspector (right, selection-driven)

- Current model / family  
- Effort ladder (if multi)  
- Weights (compact)  
- “Solo / compare / exclude”

### 4.5 What to delete from always-on UI

- Permanent 3-projection row  
- STAGE KEY as spatial competitor (keep as popover)  
- Task charts / incomplete as default open  
- Duplicate family chip wall *and* multi-select *and* steppers without a tree  

Keep steppers **only** as shortcuts once hierarchy exists (`[` `]` family still fine).

---

## 5. Mapping research → concrete product decisions

| Research principle | Product decision |
|--------------------|------------------|
| Progressive disclosure | App shell: scope drawer + inspector; not one scroll column |
| Filters are primary interaction | Scope bar + Edit scope is the #1 control |
| High-cardinality → search + hierarchy | Lab → family → effort tree, not flat chips |
| Apply for expensive membership changes | Stage updates on Apply (or debounced Apply) |
| 3D explore / 2D verify | Mode switch, not permanent dual chrome |
| Selection drives detail | Inspector; kill permanent leaderboard wall |
| Power user + ease | Defaults strict (cloud + 2026 floor); control is deep but in one place |

---

## 6. Antagonistic counter-arguments (steelman)

**“But we already made the stage bigger.”**  
Spatial majority ≠ cognitive majority. Controls still encode **too many peer concepts**.  

**“Analysts want everything visible.”**  
They want **everything available**, and **membership always legible**. They do not want every control expanded.  

**“App shell is generic SaaS.”**  
A shell is structure, not branding. Bloomberg / Tableau / Observable all use shells; the *content* stays instrument-specific.  

**“Table-primary kills the magic.”**  
Magic without control is a demo. Your stated job is control + ease. Table mode can be secondary; membership control still needs table-or-tree semantics.

---

## 7. Proposed redesign phases (if you greenlight)

| Phase | Outcome | Effort |
|-------|---------|--------|
| **P0** | Scope bar + “Edit visible set” drawer (tree + apply); freeze permanent projection strip into **2D mode** | 1–2 days |
| **P1** | Inspector panel (selection + effort + weights); gut console scroll | 1–2 days |
| **P2** | Table mode with multi-select membership | 1–2 days |
| **P3** | Compare tray (2–4 families pinned) | later |

Do **not** start with another visual polish pass. Structure first.

---

## 8. Decision request

Pick a structural direction:

1. **App shell (A)** — recommended  
2. **Table-primary workbench (B)**  
3. **Focus+context only (C)**  
4. **Minimal: Scope modal only (D)**  

Once chosen, implementation becomes a vertical slice (P0), not more layout CSS.

---

## References (practices used)

- Progressive disclosure for dashboards (IxDF, 2026 updates; enterprise UX progressive disclosure).  
- Tableau filter interaction model (filters as primary; avoid high-cardinality quick filters; sequential filters).  
- BI dashboard interactivity norms (Power BI / Tableau slicers, apply patterns, drill-down).  
- Multi-dimensional viz: 3D for structure, 2D/table for precision (standard analytical guidance still current in 2025–26 “best practices” guides).  
- Product constraints: cloud labs + release floor ≥ 2026-01-01 (this repo).
