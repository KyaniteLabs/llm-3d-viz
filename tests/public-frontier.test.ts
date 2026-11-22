import { expect, it } from "vitest";
import { publicDecision, publicFrontier } from "../src/lib/public-decision";

type PricedModel = ReturnType<typeof publicDecision>["eligible"][number];
const seed = publicDecision(0).eligible[0];

function pricedModel(model: string, price: number, score: number): PricedModel {
  return {
    ...seed,
    model,
    price: { ...seed.price, blended_per_M: price },
    intelligence: { ...seed.intelligence, value: score },
  };
}

it("keeps exact frontier ties while excluding models that tie on only one measure", () => {
  const leader = pricedModel("leader", 2, 70);
  const tied = pricedModel("exact tie", 2, 70);
  const lowerScore = pricedModel("lower score", 2, 65);
  const higherPrice = pricedModel("higher price", 3, 70);
  const higherScore = pricedModel("higher score", 4, 80);
  expect(publicFrontier([leader, tied, lowerScore, higherPrice, higherScore]))
    .toEqual([leader, tied, higherScore]);
});

it("keeps a single priced model on the frontier", () => {
  const only = pricedModel("only candidate", 1, 50);
  expect(publicFrontier([only])).toEqual([only]);
});
