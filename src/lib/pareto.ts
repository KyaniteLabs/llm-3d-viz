import { isScorable, type Model } from "../data/models";

export interface RidgeVertex {
  /** The alphabetically first provider at this unique metric triple. */
  model: Model;
  /** Other models sharing the exact triple, retained for hover/readout use. */
  aliases: Model[];
}

function publishedMetrics(model: Model): [number, number, number] {
  return [
    Math.round(model.tps! * 10) / 10,
    Math.round(model.blended_price_per_M! * 100) / 100,
    Math.round(model.aa_intelligence_index! * 10) / 10,
  ];
}

/** Raw linear-space Pareto dominance: speed/intelligence maximize, cost minimize. */
export function dominates(a: Model, b: Model): boolean {
  if (!isScorable(a) || !isScorable(b)) return false;
  const [aSpeed, aCost, aIntelligence] = publishedMetrics(a);
  const [bSpeed, bCost, bIntelligence] = publishedMetrics(b);
  const atLeastAsGood = aSpeed >= bSpeed && aCost <= bCost && aIntelligence >= bIntelligence;
  const strictlyBetter = aSpeed > bSpeed || aCost < bCost || aIntelligence > bIntelligence;
  return atLeastAsGood && strictlyBetter;
}

/** Returns the non-dominated, complete, non-quarantined model rows. */
export function frontier(models: readonly Model[]): Model[] {
  const valid = models.filter(isScorable);
  return valid.filter((candidate) => !valid.some((other) => other !== candidate && dominates(other, candidate)));
}

function compareRidge(a: Model, b: Model): number {
  const [aSpeed, aCost, aIntelligence] = publishedMetrics(a);
  const [bSpeed, bCost, bIntelligence] = publishedMetrics(b);
  return (
    aCost - bCost ||
    aIntelligence - bIntelligence ||
    bSpeed - aSpeed ||
    a.provider.localeCompare(b.provider) ||
    a.model.localeCompare(b.model)
  );
}

function sameTriple(a: Model, b: Model): boolean {
  const [aSpeed, aCost, aIntelligence] = publishedMetrics(a);
  const [bSpeed, bCost, bIntelligence] = publishedMetrics(b);
  return aSpeed === bSpeed && aCost === bCost && aIntelligence === bIntelligence;
}

/** Sorts the frontier by cost ascending, intelligence ascending, speed descending and dedupes tied triples. */
export function ridgeOrder(frontierModels: readonly Model[]): RidgeVertex[] {
  const ordered = [...frontierModels].filter(isScorable).sort(compareRidge);
  const vertices: RidgeVertex[] = [];
  for (const candidate of ordered) {
    const vertex = vertices.find(({ model }) => sameTriple(model, candidate));
    if (vertex) {
      vertex.aliases.push(candidate);
    } else {
      vertices.push({ model: candidate, aliases: [] });
    }
  }
  return vertices;
}
