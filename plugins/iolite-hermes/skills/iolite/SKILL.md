---
name: iolite
description: Pick an LLM for a job with the Iolite tools. Set an intelligence floor, then trade cost against intelligence (and speed, once measured), and answer with a short ranked list and its tradeoffs.
---

# Iolite: pick a model

Use this when someone asks which model to use, wants a cheaper or faster model that is still smart enough, or wants to compare a model against the field. Don't use it for questions the catalog can't answer, such as which model writes better poetry.

## Steps

1. **Set the floor.** If the user names a model they trust ("at least as good as X"), pass it as `anchor_model`. Otherwise pass `floor` on the catalog's 0–100 intelligence score scale. If they give neither, the default of 50 applies; say so.
2. **Pick the objective.** Use `min_cost` for "cheapest", `max_speed` for "fastest", and `balanced` for everything else. With `balanced`, `bias` leans from −1 (cheaper) to +1 (faster, or smarter while speed is unmeasured).
3. **Call `iolite_shortlist`.** Keep `n` at 3 unless the user asks for more; the maximum is 25.
4. **Answer.** For each pick, give the model, its intelligence score, its blended price per million tokens and its speed only if it shows a local measurement. Every pick is on the front named by `mode`, so state the tradeoff from those numbers (for example "half the price, three points less intelligence"), not reasons the data doesn't give. If `speed` says "not measured yet", say so; never invent a speed. Also give the floor you applied and how many models cleared it.
5. **Look one up** with `iolite_model` when the user names a specific model.

## Rules

- If the result says no catalog is configured, tell the user to set `catalog_path` or `catalog_url`. Don't make up numbers.
- If the shortlist is empty, read `refusals`. `no_scorable_models` (and `scorable_count` of 0) means no row has both a price and an intelligence score: say the catalog lacks that data and that no floor will help. `no_pick_eligible_models` means some rows are complete but none reaches the floor: give `max_scorable_intelligence` and offer a floor at or below it.
- If `rows_refused_for_provenance` is above 0, say that many catalog rows were refused because their source names Artificial Analysis.
- Benchmark scores describe the benchmark, not the user's task. Say so when the top picks are close.
