---
name: iolite
description: Pick an LLM for a job, compare models with Iolite, control its Desktop pane, or guide Desktop setup. Set an intelligence floor, trade cost against intelligence (and measured speed), and show the choices live.
---

# Iolite: pick a model

Use this when someone asks which model to use, wants a cheaper or faster model that is still smart enough, wants to compare a model against the field, or wants to set up or control the Iolite Desktop pane. Don't use it for questions the catalog can't answer, such as which model writes better poetry.

## Steps

1. **Set the floor.** If the user names a model they trust ("at least as good as X"), pass it as `anchor_model`. Otherwise pass `floor` on the catalog's 0–100 intelligence score scale. If they give neither, the default of 50 applies; say so.
2. **Pick the objective.** Use `min_cost` for "cheapest", `max_speed` for "fastest", and `balanced` for everything else. With `balanced`, `bias` leans from −1 (cheaper) to +1 (faster, or smarter while speed is unmeasured).
3. **Call `iolite_shortlist`.** Keep `n` at 3 unless the user asks for more; the maximum is 25.
4. **Answer.** For each pick, give the model, its intelligence score, its blended price per million tokens and its speed only if it shows a local measurement. Every pick is on the front named by `mode`, so state the tradeoff from those numbers (for example "half the price, three points less intelligence"), not reasons the data doesn't give. If `speed` says "not measured yet", say so; never invent a speed. Also give the floor you applied and how many models cleared it.
5. **Look one up** with `iolite_model` when the user names a specific model.

## Drive the Desktop pane

Shortlist and model calls already update an open pane without reload: shortlist moves the dashed floor, marks diamond picks and focuses the first pick; model lookup focuses its first match. The pane announces changes for screen readers. Events carry only floor, objective and model slugs, even when remembering shortlists is off.

Use `iolite_show` to switch views or adjust the pane: `{"view": "2d", "focus_model": "GPT-6.1 Terra", "floor": 60, "reset_camera": true}`. `view` is required (`3d` or `2d`); omit other controls to preserve them. `focus_model` accepts a catalog name or slug using the model lookup rules; ambiguous names are refused, so use an exact slug. Floor is 0–100; reset_camera is boolean. A model without a plotted mark in the bundled catalog is announced as unplotted.

Read `desktop_listening` in the result: true means a pane acknowledged this command; false means no receipt arrived within one second (including when the local REST route is unavailable). Say plainly: "no Desktop window is listening; ask the user to open the Iolite pane" and give this one-sentence setup path: **Capabilities -> Plugins -> search "Iolite" -> switch on, then composer button "Iolite"**. `/iolite status` performs the same listening check and prints the path. The Desktop half ships off by default, and its switch lives in the client's browser storage; guide the user through it rather than attempting to enable it yourself. CLI and gateway tools still work without Desktop or Hermes' event bridge.

## Rules

- If the result says no catalog is configured, tell the user to set `catalog_path` or `catalog_url`. Don't make up numbers.
- If the shortlist is empty, read `refusals`. `no_scorable_models` (and `scorable_count` of 0) means no row has both a price and an intelligence score: say the catalog lacks that data and that no floor will help. `no_pick_eligible_models` means some rows are complete but none reaches the floor: give `max_scorable_intelligence` and offer a floor at or below it.
- If `rows_refused_for_provenance` is above 0, say that many catalog rows were refused because their source names Artificial Analysis.
- Benchmark scores describe the benchmark, not the user's task. Say so when the top picks are close.
- Include the data credit lines the tool returns (`data_credits`) in your answer, as written. They credit the data sources under their licences.
