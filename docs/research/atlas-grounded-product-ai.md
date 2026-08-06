# Research: atlas-grounded product AI patterns (tools over catalog, fail-closed)

**Ticket:** Forgejo #130  
**Map:** #128 (intelligence-floor decision mode + atlas AI)  
**Status:** research complete (doc only — issue left open)  
**Date:** 2026-08-05  
**Scope:** patterns for an in-product LLM that navigates a **trusted structured catalog** (metrics, model rows) without inventing numbers. No product implementation in this ticket.

---

## Ticket resolution summary

**Question (from #130):** What are the current best patterns for an in-product LLM that navigates a trusted structured catalog — tool-calling over metrics, row retrieval, constrained recommendations, offline/degraded modes, and anti-hallucination of numeric fields?

**Answer in one line:** Treat the LLM as a **planner and explainer**, not a fact store. All numbers (TPS, $/M, Intelligence Index, floors, eligibility) come from **deterministic catalog tools**; the model proposes filters/anchors/ranks; **host code fails closed** when a required field is null or missing; free-form chat over parametric memory is an anti-pattern for this product.

**Patterns to adopt**

| Pattern | Why it fits llm-3d-viz |
|---|---|
| **Strict tool calling** over catalog queries (not RAG over prose) | Catalog is already structured JSON with nulls; tools return rows + provenance |
| **Host-side math** (floor, eligibility, Pareto rank, cost×speed sort) | Same honesty bar as `frontier-math.md` / plot admission — LLM must not recompute dollars |
| **Fail-closed on null metrics** | Matches UI (`format*` → `"—"`) and plot admission (`hasMappedAxes`); AI must say "unmeasured," not invent |
| **Structured final answers** (schema for floor proposal / shortlist / citations) | UI can highlight models and show evidence without parsing prose |
| **Min-capability then cost/speed** (OpenRouter Pareto / Auto dials as product analogues) | Aligns with map #128 intelligence-floor decision mode |
| **Offline / degraded mode** | Deterministic floor + table UI works without any LLM |

**Patterns to refuse**

- Free-form "chat about models" that can emit TPS/$ from training data  
- Stuffing the full catalog into the system prompt as the only grounding (works at n≈40 but still lets the model paraphrase numbers wrongly)  
- Letting the LLM invent effort tiers, blended prices, or Elo when join left null (ADR-0001 already fail-closed here)  
- Treating theoretical task↔IQ priors as overrides of the user floor (#128)

**Feeds next:** #134 (internal AI surface: roles, tools, grounding contract), #131–#133 (floor + cost×speed decisions).

---

## 1. Context for this product

llm-3d-viz's product catalog is a **versioned, multi-source join** of model rows:

- Primary spine: Artificial Analysis metrics (Intelligence Index, TPS, TTFT, AA 7:2:1 blended price, …).  
- Overlays: Arena Elo, OpenRouter list/derived prices with `sources` provenance (ADR-0001).  
- Product plot admission is already **fail-closed**: a point needs measured values on the mapped axes (`hasMappedAxes`); formatters render `null` as `"—"`, never a guess.

Map #128 wants an **internal AI** that is **core** to intelligence-floor decision mode:

1. User (or AI) sets a **minimum intelligence** (often via a known-good model/effort anchor).  
2. Everything at/above that floor is eligible.  
3. Among eligibles, the live tradeoff is **cost ↔ speed**.  
4. AI may propose floor, explain eligibility, recommend on the cost/speed plane — **never invent metrics**.

That is the "atlas" contract: the catalog is the map; the model is a navigator with instruments, not a cartographer inventing coastlines.

---

## 2. Tool-calling over structured data (primary patterns)

### 2.1 Core loop (industry standard)

OpenAI's function/tool-calling model is the de facto production shape:

1. App sends user prompt + **tool definitions** (JSON Schema).  
2. Model returns a **tool call** (name + arguments), not a final numeric claim.  
3. **Application code** executes the tool against trusted systems.  
4. Tool **output** is fed back; model may call more tools or answer.  
5. Final user-facing text is grounded in tool outputs.

Primary docs: [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling); [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) (strict schema for tool args and/or final response). Anthropic's tool use follows the same client-executed / server-executed split ([Claude tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview); [Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)).

**Implication for catalog AI:** the model should never be the authority for `tps`, `blended_price_per_M`, or `aa_intelligence_index`. Those values appear only inside tool results copied from the catalog snapshot (or derived by pure functions of those results).

### 2.2 Prefer tools over unstructured RAG for numeric catalogs

| Approach | Strength | Weakness for metrics |
|---|---|---|
| **RAG over docs/HTML** | Good for methodology prose, changelogs | Chunking + generation can still invent or mis-copy numbers |
| **Tool over structured store** | Exact field access, null preserved, filter/sort deterministic | Requires tool design + execution host |
| **Full dump in context** | Simple for small n | Model can still restate wrong numbers; burns tokens; no typed null contract |

For a **small trusted catalog** (n tens–low hundreds), tools that **query/filter/sort/join** rows beat embedding retrieval. RAG remains useful only for **non-numeric** text (methodology, caveats, "what is AA Index?"), and even then answers should not include live leaderboard figures without a tool call.

Industry practice commonly splits: RAG for unstructured evidence, **tool calling for structured/dynamic facts** (see Cloudwalk: [RAG, Tool-Calling, and Hallucinations](https://www.cloudwalk.io/ai/rag-tool-calling-and-the-fight-against-hallucinations)).

### 2.3 Strict schemas and structured finals

- **Strict tool inputs** (`strict: true` / Anthropic strict tool use): arguments match schema (model ids, metric enums, floor numbers). Reduces "almost a filter" junk.  
- **Structured final response** (JSON Schema / Zod / Pydantic): e.g. `{ floor, floor_source, eligible_ids[], shortlist[], citations[], refuse_reason? }`. UI binds to this; prose is optional narration.  
- OpenAI guidance: use **function calling** when connecting to app data/actions; use **text format schemas** when shaping the user-visible answer ([Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)).

For llm-3d-viz, both layers: tools for catalog access, structured answer for "apply this floor / highlight these three models."

### 2.4 Keep intermediate bulk out of the model context

Anthropic's **Programmatic Tool Calling** pattern: when many rows or aggregates are needed, run filters/sums in code (or a sandbox) and return **summaries + ids**, not thousands of line items ([Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)).

Even with ~40 models, prefer:

- `list_models(filters) → ids + key metrics`  
- `get_model(id) → full row`  
- `eligible_above_floor(metric, threshold) → ids[]` computed in host  
- `rank_cost_speed(ids, preference) → ordered ids` in host  

…rather than pasting the entire JSON and asking "who is cheapest?"

### 2.5 Tool design principles (catalog-specific)

1. **One tool = one pure capability** with a clear description and examples (Anthropic reports large accuracy gains from **tool use examples** on complex parameters).  
2. **Enums for metrics and providers** — prevent inventing field names.  
3. **Null-preserving payloads** — always include `"tps": null` rather than omitting; document that `null` means unmeasured.  
4. **Provenance fields** — return `data_date`, `source`, `sources.tps.origin` so the model can say "per AA snapshot 2026-08-01," not "I recall."  
5. **No write tools to the catalog** in v1 product AI — recommend UI state only (`set_floor`, `highlight_models`, `set_axis_weights` as UI actions, not dataset mutations).  
6. **Idempotent, snapshot-bound** — tools read a frozen catalog revision; log `catalog_version` / hash in every tool result.

### 2.6 When tool libraries grow

If tool count balloons (routing protocol, multi-floor swarm, methodology search), use deferred discovery (Anthropic Tool Search / OpenAI tool search on newer models). **For map #128 v1, a small fixed tool set is enough** and more accurate than a large deferred library.

---

## 3. Fail-closed numeric grounding

### 3.1 Definition

**Fail-closed** (for product AI): if a claim requires a numeric field and that field is missing, null, NaN, or outside the admitted join policy, the system **refuses the claim** (or marks the model ineligible / incomplete) rather than substituting parametric knowledge, averages, or "typical" values.

This is stricter than "try not to hallucinate." It is a **host invariant**, not a prompt hope.

### 3.2 Layers of enforcement (defense in depth)

| Layer | Responsibility | Example |
|---|---|---|
| **Schema** | Types allow `null`; no default 0 for prices/TPS | `tps: number \| null` in catalog |
| **Tool implementation** | Return null; never fill from LLM memory | `get_metric(id,"tps") → { value: null, reason }` |
| **Admission / policy** | Same rules as plot join | No Elo-only point; no invented effort tier (ADR-0001) |
| **Answer schema** | `refuse_reason` / `missing_fields[]` first-class | Structured refusal, not empty shortlist |
| **UI** | Display `"—"`; don't animate fake positions | Existing `formatTps` / `hasMappedAxes` |
| **Eval / tests** | Fixture models with nulls; assert no invented digits | Golden transcripts |

Prompt-only instructions ("never invent numbers") are **necessary but insufficient**. Models still occasionally fabricate tool arguments and paraphrase wrong figures.

### 3.3 Recommended host policies

1. **Numeric claims must cite tool output**  
   Final structured answer includes `citations: [{ model_id, field, value, data_date }]` copied from tool results. Renderer shows only citation values for TPS/$/IQ.

2. **Missing field → explicit refusal path**  
   - Eligibility: model excluded from floor set if floor metric is null.  
   - Comparison: "Cannot compare A and B on cost — B has no blended price in catalog."  
   - Never: "B is roughly $X/M."

3. **Derived fields only via pure host functions**  
   Value-score, Pareto membership, floor threshold from anchor model, cost×speed rank — same pure functions as the viz (`frontier-math`, value-score, axis mapping). LLM may **request** `rank_eligible({ floor, prefer: "cost" })`, not invent ranks.

4. **Cross-source honesty**  
   If price is OpenRouter-derived and IQ is AA-measured, tools expose origin; AI must not present them as a single-lab "official" triple without provenance (ADR-0001 `sources`).

5. **Effort / multi-effort fail-closed**  
   Do not invent unpublished effort tiers (ADR-0001). If user anchors "Fable high" and only max exists, refuse or map to measured tier with explanation.

6. **Offline / LLM-down mode**  
   Floor slider + eligible table + cost/speed sort work **without** any model. AI is an accelerator, not a required path. When LLM fails: UI keeps last structured proposal or falls back to manual controls; no cached free-text that contains numbers.

### 3.4 Soft vs hard fail

| Case | Behavior |
|---|---|
| Required metric for floor missing on a row | Hard exclude from eligible set |
| Optional field (e.g. `aider_pct`) missing | Omit from explanation; do not invent |
| Catalog load / join error | Product `DATA_ERROR` style — AI disabled or "catalog unavailable" |
| User asks outside catalog ("what does GPT-6 cost?") | Refuse; offer nearest catalog match only via search tool |
| Methodology question | Allow prose from docs RAG or static help; no live numbers |

### 3.5 Alignment with existing product code

Already fail-closed patterns to mirror in AI tools:

- `Model` fields `number | null` with optional `null_reason`.  
- `formatTps` / `formatPricePerM` / `formatIntelligence` → `"—"` on null.  
- `hasMappedAxes` excludes unscorable points from 3D placement.  
- ADR-0001: no invented Fable effort tiers; Arena Elo does not alone admit a plot point.

**Product AI should reuse the same pure functions and null semantics**, not reimplement them in natural language.

---

## 4. Model routers / gateways that expose min-capability or cost–speed tradeoffs

These products matter as **external analogues** of map #128's intelligence-floor + cost×speed surface, and as possible **consumers** of a future routing protocol (#135). They are not implementations of our internal AI.

### 4.1 OpenRouter Pareto Router (`openrouter/pareto-code`)

Primary: [Pareto Router docs](https://openrouter.ai/docs/guides/routing/routers/pareto-router).

- User expresses **`min_coding_score` ∈ [0, 1]** (capability floor).  
- Score maps to tiers (high / medium / low) via **Artificial Analysis coding percentile** bands.  
- Within tier: pick **cheapest** available model (or **fastest** with `:nitro` by p50 throughput).  
- Fallbacks same-tier on provider errors; neighboring tier only if tier empty.  
- Session stickiness pins model+provider for multi-turn consistency / cache.  
- Explicit limitation: coding-only; **cannot directly cap cost or latency** beyond score + nitro; shortlist evolves as AA field moves (percentile is relative, not absolute IQ).

**Product lesson:** separate **capability floor** from **secondary optimization** (cost or speed). That is exactly #128's intelligence plane then cost×speed plane.

### 4.2 OpenRouter Auto Router (`openrouter/auto-beta`)

Primary: [Auto Router docs](https://openrouter.ai/docs/guides/routing/routers/auto-router).

- Classifies prompt into ~30 task types; ranks by community **share of spend** (7-day live signal).  
- **`cost_quality_tradeoff` 0–10** or named **`cost_tier`** (low…max) filters the pool by cost percentile.  
- `allowed_models` wildcards constrain the pool.  
- Degrades to default set if classification/rankings fail (request still serves).  
- Older `openrouter/auto` used Not Diamond; deprecated in favor of Auto Beta.

**Product lesson:** expose an explicit **cost–quality dial** separate from task classification; always report which concrete model served.

### 4.3 Not Diamond (learned / intelligent routing)

Primary: [Not Diamond routing guide](https://www.notdiamond.ai/blog/a-comprehensive-guide-to-model-routing), [docs](https://docs.notdiamond.ai/).

- Distinguishes **gateway** (unified access) vs **router** (which model).  
- Intelligent routing via classifiers / learned policies over cost, quality, latency objectives.  
- Stresses **cache-aware routing** for agent sessions (mid-session model switches can destroy prompt-cache economics).  
- Session / sub-agent / task / step routing levels.

**Product lesson:** for swarm follow-on (#135), dual floors (scout vs reviewer) should pin models within a session; don't thrash for a few cents.

### 4.4 LiteLLM (gateway + deterministic routing strategies)

Primary: [LiteLLM Router](https://docs.litellm.ai/docs/routing), [Proxy load balancing](https://docs.litellm.ai/docs/proxy/load_balancing).

Strategies include: simple-shuffle, least-busy, usage-based, **latency-based**, **cost-based**, deployment `order` priority, fallbacks, cooldowns, RPM/TPM.

**Product lesson:** deterministic reliability routing is complementary to intelligence-floor routing. Our catalog AI is about **selection policy**; gateways are about **execution reliability**. Map #128 should not conflate the two.

### 4.5 Artificial Analysis as data plane for routers

AA positions its Data API for "Agents and model routers" — benchmarks, pricing, latency for runtime selection ([AA Data API](https://artificialanalysis.ai/data-api)). OpenRouter Pareto already consumes AA coding percentiles.

**Product lesson:** llm-3d-viz can be the **decision UI + protocol** that uses the same class of metrics AA publishes; we already curate a join. Internal AI grounds in **our** snapshot, not live web scrape during chat.

### 4.6 Other gateways (Portkey, Helicone, …)

Commercial/OSS gateways emphasize multi-provider access, fallbacks, observability, budgets (Portkey, Helicone, etc.). Useful for **hosting** the internal AI's own inference; not substitutes for catalog grounding. Prefer: call any chat model through a gateway **with tools bound to our catalog**, never "ask the frontier model about models" without tools.

---

## 5. Anti-patterns (especially free-form chat inventing TPS/$)

| Anti-pattern | Failure mode | Prefer |
|---|---|---|
| **Parametric chat** "What's Claude's TPS?" with no tools | Stale or fabricated numbers | `get_model` / `get_metric` tools only |
| **Uncited prose numbers** even after tools | Model "remembers" 180 tok/s while tool said 142.3 | Render numbers **only** from structured citations / tool JSON |
| **System-prompt full dump without null contract** | Model fills gaps with priors | Typed tool rows with null |
| **RAG over scraped AA HTML for live prices** | Brittle parse + generation drift | Versioned catalog JSON + refresh pipeline |
| **LLM-computed blends** ("I'll average in/out 1:1") | Diverges from AA 7:2:1 | Only catalog `blended_price_per_M` or host formula |
| **Silent defaulting** null → 0 cost or median IQ | Free models look free-and-perfect; ghosts dominate Pareto | Exclude or show incomplete |
| **Training-data model lists** ("top 10 models in 2024…") | Wrong frontier, wrong names | `search_catalog(query)` |
| **Overriding user floor with "task theory"** | Reintroduces user-skill bias (#128 out of scope) | Theoretical priors optional **below** user floor only |
| **Auto-routing mid-conversation without stickiness** | Inconsistent advice + cost spikes | Session pin for recommendations / swarm |
| **Required AI for decisions** | Offline users blocked | Deterministic floor UI first |

**Hallucination detection** (LLM-as-judge over free text) is a backstop for long RAG answers, not a substitute for never letting free text be the source of truth for metrics ([Datadog LLM-as-judge approach](https://www.datadoghq.com/blog/ai/llm-hallucination-detection/) is relevant for prose claims, not for replacing tools).

---

## 6. Concrete recommendations for llm-3d-viz internal AI

### 6.1 Roles (keep few, explicit)

| Role | Owns | Must not |
|---|---|---|
| **Atlas navigator** (user-facing) | Interpret intent; call tools; explain eligibility; propose floor/shortlist in structured form | Invent metrics; mutate catalog |
| **Catalog tools host** (deterministic code) | Query/filter/join, floor admission, cost×speed rank, Pareto helpers | Call an LLM for arithmetic |
| **UI applicator** | Apply structured proposal to floor, filters, highlights, cinema focus | Accept unstructured number strings |
| **Optional methodology helper** | Explain AA Index, blend policy, caveats from static docs | Quote live TPS/$ without tools |
| **Future routing adapter** (#135) | Export floor + shortlist as machine policy for swarm/gateway | Re-score models outside catalog |

Do **not** ship a general "assistant that knows the LLM industry." Ship a **decision instrument with a grounded mouthpiece.**

### 6.2 Minimal tool set (v1 proposal for #134)

```
search_models(query?: string, provider?: enum, openness?: enum) → ModelSummary[]
get_model(id: string) → ModelRow | not_found
get_metric(id: string, field: MetricEnum) → { value: number|null, unit, data_date, source, origin? }
set_intelligence_floor_from_anchor(model_id: string) → { floor: number, metric, anchor } | refuse
list_eligible(floor: number, metric: MetricEnum) → { eligible_ids, excluded: {id, reason}[] }
rank_eligible(ids: string[], objective: "min_cost" | "max_speed" | "balanced", weights?) → RankedRow[]
compare_models(ids: string[], fields: MetricEnum[]) → matrix with nulls preserved
get_catalog_meta() → { version, data_date, model_count, join_policy }
```

Host implements floor/eligibility/rank with the **same pure functions** as the viz. Tools return JSON only; no HTML.

Optional later: `explain_methodology(topic)` from static docs; `apply_ui_state(proposal)` as a client-side tool.

### 6.3 Grounding contract (normative sketch)

1. Every numeric user-visible claim in AI output is either:  
   - copied from a tool result in the same turn, or  
   - the result of a pure host function over tool results.  
2. `null` never becomes a number.  
3. Unknown model names → search tool → not_found, not a fabricated row.  
4. Answers include `catalog_version` / `data_date`.  
5. Structured response schema is validated before UI apply; invalid → refuse apply.  
6. Logging: store tool I/O for audit; red-team with null-heavy fixtures.

### 6.4 Prompt / policy (thin layer)

System instructions should be short and **role-enforcing**, not a second catalog:

- You are the atlas navigator for this product's catalog.  
- Call tools before any numeric claim.  
- If a field is null, say unmeasured and exclude from rankings that need it.  
- Prefer anchor-model floors over invented absolute IQ numbers.  
- Do not use pretraining knowledge for TPS, price, or index values.

All hard guarantees live in **tools + validators**, not in the prompt.

### 6.5 UX surfaces (product, not chat-first)

Aligned with destination C (viz-first) from #128:

1. **Primary:** intelligence floor control (slider and/or anchor picker) + eligible cloud on cost×speed — works offline.  
2. **AI assist:** "Set floor from my current known-good model," "Explain why X is out," "Cheapest among eligible," "Fastest among eligible."  
3. **Outputs:** chips/highlights on the stage + short structured explanation, not a wall of chat.  
4. **Citations:** hover shows field + data_date + origin (AA / Arena / OpenRouter).

### 6.6 Offline / degraded modes

| Mode | Behavior |
|---|---|
| **Full** | Tools + LLM + UI apply |
| **Tools only / LLM down** | Manual floor; no NL assist |
| **Stale catalog** | Banner with `data_date`; AI still grounded in stale truth (honest) |
| **Join partial** | Incomplete models listed separately (mirror incomplete-data UI) |

### 6.7 Evaluation checklist (before calling AI "done")

- [ ] Null TPS/price/IQ fixtures never produce fabricated numbers in structured output.  
- [ ] Anchor floor equals host-read metric of that model.  
- [ ] Eligible set matches pure `list_eligible` for random floors.  
- [ ] Cost rank order matches host sort on eligible subset.  
- [ ] Out-of-catalog names refuse.  
- [ ] Effort-missing cases refuse inventing tiers.  
- [ ] Offline path can complete a decision without LLM.  
- [ ] Provenance shown for non-AA overlay fields.

### 6.8 What not to build in the first internal-AI slice

- Open-ended multi-provider agent platform.  
- Auto user-skill diagnosis.  
- Live scrape during chat.  
- Replacing Three stage with chat-centric UX.  
- LLM-owned Pareto math (already specified in `docs/research/frontier-math.md`).

---

## 7. Mapping research → map #128 children

| Child | How this doc helps |
|---|---|
| **#131** Floor definition | Prefer anchor-model → metric value (tool) over free-typed IQ unless validated against catalog range |
| **#132** Theoretical baselines | Optional prior only; never override user floor; never invent metrics |
| **#133** Cost×speed surface | Host rank tools after eligibility; mirrors OpenRouter "floor then optimize" |
| **#134** Internal AI surface | Use §6 roles, tools, grounding contract as decision input |
| **#135** Routing protocol | Export floor + eligible shortlist + objective; session stickiness; gateway is separate |
| **#136** Prototype plane | Deterministic floor + eligible surface first; AI is optional narrator/proposer |

---

## 8. Sources (primary preferred)

### Tool calling & structured outputs

- OpenAI — Function calling: https://developers.openai.com/api/docs/guides/function-calling  
- OpenAI — Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs  
- Anthropic — Tool use overview: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview  
- Anthropic — Advanced tool use (Tool Search, Programmatic Tool Calling, examples): https://www.anthropic.com/engineering/advanced-tool-use  

### Routers / gateways / AA

- OpenRouter — Pareto Router: https://openrouter.ai/docs/guides/routing/routers/pareto-router  
- OpenRouter — Auto Router: https://openrouter.ai/docs/guides/routing/routers/auto-router  
- Not Diamond — Model routing guide: https://www.notdiamond.ai/blog/a-comprehensive-guide-to-model-routing  
- LiteLLM — Router / load balancing: https://docs.litellm.ai/docs/routing · https://docs.litellm.ai/docs/proxy/load_balancing  
- Artificial Analysis — Data API (router/agent positioning): https://artificialanalysis.ai/data-api  

### Grounding / hallucination (secondary)

- Cloudwalk — RAG vs tool calling: https://www.cloudwalk.io/ai/rag-tool-calling-and-the-fight-against-hallucinations  
- Datadog — LLM-as-judge hallucination detection: https://www.datadoghq.com/blog/ai/llm-hallucination-detection/  

### Repo-local authority

- Map #128 body (destination, internal AI constraint, out-of-scope inventing metrics)  
- `SPEC.md` — catalog schema, decision-tool goal, workload recommender (related, not identical to floor)  
- `docs/research/frontier-math.md` — host-side Pareto / value-score honesty  
- `docs/adr/0001-multi-source-catalog-join.md` — fail-closed join, provenance  
- `src/data/models.ts`, `src/lib/format.ts`, `src/lib/axis-metrics.ts` — null + admission semantics  

---

## 9. Out of scope for this ticket

- Implementing tools, UI, or LLM host.  
- Closing Forgejo #130 / updating map checkboxes (left for the wayfinder session).  
- Choosing inference provider/keys for the internal AI.  
- Final floor metric UX (#131) and routing protocol wire format (#135).
