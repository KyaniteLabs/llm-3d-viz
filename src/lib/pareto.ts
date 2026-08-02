import type { Model } from "../data/models";

export interface RidgeVertex {
  /** The alphabetically first provider at this unique metric triple. */
  model: Model;
  /** Other models sharing the exact triple, retained for hover/readout use. */
  aliases: Model[];
}

function isComplete(model: Model): boolean {
  return (
    model.tps !== null &&
    model.blended_price_per_M !== null &&
    model.blended_price_per_M >= 0 &&
    model.aa_intelligence_index !== null
  );
}

/** Raw linear-space Pareto dominance: speed/intelligence maximize, cost minimize. */
export function dominates(a: Model, b: Model): boolean {
  if (!isComplete(a) || !isComplete(b)) return false;
  const atLeastAsGood = a.tps! >= b.tps! && a.blended_price_per_M! <= b.blended_price_per_M! && a.aa_intelligence_index! >= b.aa_intelligence_index!;
  const strictlyBetter =
    a.tps! > b.tps! ||
    a.blended_price_per_M! < b.blended_price_per_M! ||
    a.aa_intelligence_index! > b.aa_intelligence_index!;
  return atLeastAsGood && strictlyBetter;
}

/** Returns the non-dominated, complete, non-quarantined model rows. */
export function frontier(models: readonly Model[]): Model[] {
  const valid = models.filter(isComplete);
  return valid.filter((candidate) => !valid.some((other) => other !== candidate && dominates(other, candidate)));
}

function compareRidge(a: Model, b: Model): number {
  return (
    a.blended_price_per_M! - b.blended_price_per_M! ||
    a.aa_intelligence_index! - b.aa_intelligence_index! ||
    b.tps! - a.tps! ||
    a.provider.localeCompare(b.provider) ||
    a.model.localeCompare(b.model)
  );
}

function sameTriple(a: Model, b: Model): boolean {
  return a.tps === b.tps && a.blended_price_per_M === b.blended_price_per_M && a.aa_intelligence_index === b.aa_intelligence_index;
}

/** Sorts the frontier by cost ascending, intelligence ascending, speed descending and dedupes tied triples. */
export function ridgeOrder(frontierModels: readonly Model[]): RidgeVertex[] {
  const ordered = [...frontierModels].filter(isComplete).sort(compareRidge);
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
