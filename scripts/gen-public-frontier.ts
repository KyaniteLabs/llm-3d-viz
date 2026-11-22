import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { publicDecision, publicFrontier } from "../src/lib/public-decision";
import { buildAtom } from "./lib/atom.mjs";

const output = process.argv[2];
if (!output) throw new Error("Expected an output directory for the public frontier.");

const { eligible, catalog_date, score_basis, price_basis } = publicDecision(0);
const frontier = publicFrontier(eligible);
const events: [] = []; // A single bundled snapshot has no comparable movement history.
writeFileSync(join(output, "frontier-watch.json"),
  JSON.stringify({ as_of: catalog_date, score_basis, price_basis, frontier, events }, null, 2) + "\n");
const escapeCell = (text: string) => text.replace(/[\\|`*_<>[\]]/g, "\\$&").replace(/[\r\n]+/g, " ");
const rows = frontier.map((row) => `| ${escapeCell(row.model)} | ${escapeCell(row.provider ?? "Unknown")} | $${row.price.blended_per_M.toPrecision(4)} | ${row.intelligence.value.toFixed(1)} |`);
writeFileSync(join(output, "frontier-watch.md"),
  `# Frontier Watch — price and capability

Public decision snapshot: ${catalog_date}. ${score_basis}. ${price_basis}.
The frontier includes ${frontier.length} of ${eligible.length} priced models with direct Epoch scores, across all providers at floor 0.
[Data sources, method and licences](/sources/#decision-data)

| Model | Provider | Blended USD / 1M tokens | Epoch score |
|---|---|---:|---:|
${rows.join("\n")}

Movement history needs a second comparable snapshot.
`);
writeFileSync(join(output, "frontier-watch.xml"), buildAtom(events));
