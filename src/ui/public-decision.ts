import "../styles/public-decision.css";
import { PUBLIC_SCORE_FLOOR, publicDecision, publicFrontier, publicProviders } from "../lib/public-decision";

const priceFormat = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumSignificantDigits: 4,
});

export function mountPublicDecision() {
  const shell = document.querySelector<HTMLElement>("#app-shell")!;
  shell.className = "public-decision";
  shell.hidden = false;
  shell.innerHTML = `
    <header><strong>Iolite</strong><a href="?view=observatory">Original observatory</a></header>
    <main>
      <h1>Choose a model by price and capability</h1>
      <p>Set a minimum Epoch score and compare model prices, lowest first.</p>
      <p>No public speed measurements are bundled. These results use price and direct Epoch scores.</p>
      <form>
        <label>Minimum Epoch score
          <input name="floor" type="number" min="0" max="100" step="any" value="${PUBLIC_SCORE_FLOOR}" required>
        </label>
        <label>Provider
          <select name="provider"><option value="">All providers</option></select>
        </label>
      </form>
      <p role="status"></p>
      <div class="public-results" role="region" aria-label="Model prices" tabindex="0"><table>
        <thead><tr><th scope="col">Model</th><th scope="col">Provider</th>
          <th scope="col">Epoch score (0–100)</th><th scope="col">Blended USD / 1M tokens</th>
        </tr></thead><tbody></tbody>
      </table></div>
      <footer>
        <p>Snapshot <time></time>. Epoch AI Capabilities Index scores are normalized to 0–100 using the
          source snapshot’s range. Prices are LiteLLM list prices, blended at 75% input and 25% output.</p>
        <a href="/sources/#decision-data">Data sources, method and licences</a> · <a href="/frontier-watch.md">Cost–capability frontier</a>
      </footer>
    </main>`;
  const form = shell.querySelector("form")!;
  const floor = shell.querySelector<HTMLInputElement>("input")!;
  const provider = shell.querySelector<HTMLSelectElement>("select")!;
  const status = shell.querySelector<HTMLElement>("[role=status]")!;
  const results = shell.querySelector<HTMLElement>(".public-results")!;
  const tbody = shell.querySelector("tbody")!;
  for (const lab of publicProviders) provider.add(new Option(lab, lab));

  // Match the published frontier across all providers before applying view filters.
  const frontier = new Set(publicFrontier(publicDecision(0).eligible));

  function render() {
    if (!floor.validity.valid) {
      status.textContent = "Enter a minimum Epoch score from 0 to 100.";
      results.hidden = true;
      tbody.replaceChildren();
      return;
    }
    const decision = publicDecision(floor.valueAsNumber, provider.value);
    shell.querySelector("time")!.textContent = decision.catalog_date;
    const count = decision.eligible.length;
    const missing = decision.missing_price_count;
    status.textContent = decision.message ||
      `${count} priced ${count === 1 ? "model" : "models"} meet this floor.` +
      (missing ? ` ${missing} without a price ${missing === 1 ? "is" : "are"} excluded.` : "");
    results.hidden = count === 0;
    tbody.replaceChildren(...decision.eligible.map((row) => {
      const tr = document.createElement("tr");
      for (const value of [row.model, row.provider ?? "Unknown", row.intelligence.value.toString(),
        priceFormat.format(row.price.blended_per_M)]) tr.insertCell().textContent = value;
      if (row.release_date) {
        const release = document.createElement("small");
        release.className = "public-model-release";
        const date = document.createElement("time");
        date.dateTime = row.release_date;
        date.textContent = row.release_date;
        release.append("Released ", date);
        tr.cells[0].append(release);
      }
      if (frontier.has(row)) {
        const badge = document.createElement("small");
        badge.className = "public-frontier-label";
        badge.textContent = "On frontier";
        tr.cells[0].append(" ", badge);
      }
      return tr;
    }));
  }

  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", render);
  render();
}
