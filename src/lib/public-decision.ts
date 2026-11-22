import snapshot from "../../plugins/iolite-hermes/data/catalog.json";

export const PUBLIC_SCORE_FLOOR = 50;
const EPOCH_METRIC = "Epoch Capabilities Index (ECI)";
export const PUBLIC_SCORE_BASIS = `${EPOCH_METRIC}, normalized to 0–100`;
export const PUBLIC_SPEED_MESSAGE = "No public speed measurements are bundled. Rank by price to compare models using the available data.";

const epochRows = snapshot.models.filter(
  ({ intelligence }) => intelligence.metric === EPOCH_METRIC &&
    Number.isFinite(intelligence.value) && intelligence.value >= 0 && intelligence.value <= 100,
);
export const publicProviders = [...new Set(epochRows.flatMap((row) => row.provider ? [row.provider] : []))].sort();

function hasPrice<T extends { price?: { blended_per_M: number } }>(
  row: T,
): row is T & { price: NonNullable<T["price"]> } {
  return row.price != null && Number.isFinite(row.price.blended_per_M) && row.price.blended_per_M >= 0;
}

export function publicDecision(floor: number, provider?: string) {
  const pool = provider ? epochRows.filter((row) => row.provider?.toLowerCase() === provider.toLowerCase()) : epochRows;
  const aboveFloor = pool.filter((row) => row.intelligence.value >= floor);
  const eligible = aboveFloor.filter(hasPrice).sort((a, b) =>
    a.price.blended_per_M - b.price.blended_per_M ||
    b.intelligence.value - a.intelligence.value ||
    a.model.localeCompare(b.model),
  );
  let message = "";
  if (!pool.length) {
    message = "No direct Epoch scores for this provider. Choose another provider or show all providers.";
  } else if (!aboveFloor.length) {
    message = "No models meet this minimum Epoch score. Lower the score floor or show all providers.";
  } else if (!eligible.length) {
    message = "Models meet this floor but have no bundled price. Lower the score floor or show all providers.";
  }

  return {
    catalog_date: snapshot.generated,
    score_basis: PUBLIC_SCORE_BASIS,
    floor,
    provider: provider || null,
    price_basis: "USD per million tokens, 75% input and 25% output list price",
    speed_available: false,
    missing_price_count: aboveFloor.length - eligible.length,
    eligible,
    message: message || null,
  };
}

type PricedModel = ReturnType<typeof publicDecision>["eligible"][number];

export function publicFrontier(eligible: readonly PricedModel[]) {
  return eligible.filter((model) => !eligible.some((candidate) =>
    candidate.price.blended_per_M <= model.price.blended_per_M &&
    candidate.intelligence.value >= model.intelligence.value &&
    (candidate.price.blended_per_M < model.price.blended_per_M ||
      candidate.intelligence.value > model.intelligence.value),
  ));
}
