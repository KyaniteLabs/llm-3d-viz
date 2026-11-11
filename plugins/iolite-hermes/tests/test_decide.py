"""The Python port must reproduce src/lib/decide.ts on every golden case."""
import importlib.util
import json
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("iolite_decide", HERE.parent / "decide.py")
decide = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decide)

GOLDEN = json.loads((HERE / "fixtures" / "decide-golden.json").read_text())
MODELS = GOLDEN["models"]


def test_default_floor_matches_fork_defaults():
    assert decide.DEFAULT_INTELLIGENCE_FLOOR == GOLDEN["default_floor"]


@pytest.mark.parametrize("case", GOLDEN["cases"], ids=lambda c: f"f{c['floor']}-b{c['bias']}-n{c['n']}")
def test_shortlist_parity(case):
    out = decide.shortlist_from_decide(MODELS, case["floor"], case["bias"], case["n"])
    assert [m["model"] for m in out["eligible"]] == case["eligible_ids"]
    assert [m["model"] for m in out["pareto"]] == case["pareto_ids"]
    assert [m["model"] for m in out["shortlist"]] == case["shortlist_ids"]


def test_snapshot_payload_and_id_parity():
    assert decide.catalog_snapshot_payload(MODELS) == GOLDEN["snapshot_payload"]
    assert decide.catalog_snapshot_id(MODELS) == GOLDEN["snapshot_id"]


def test_dominance_uses_full_precision():
    cheap_slow = {"model": "a", "tps": 1, "blended_price_per_M": 0.001, "aa_intelligence_index": 90}
    dear_fast = {"model": "b", "tps": 2, "blended_price_per_M": 0.0049, "aa_intelligence_index": 90}
    assert not decide.dominates_cost_speed(dear_fast, cheap_slow)
    out = decide.shortlist_from_decide([cheap_slow, dear_fast], 0, -1, 3)
    assert [m["model"] for m in out["pareto"]] == ["a", "b"]
    assert out["shortlist"][0]["model"] == "a"


def test_pareto_matches_the_pairwise_definition_on_close_prices():
    import random
    rnd = random.Random(7)
    for _ in range(200):
        rows = [{"model": f"m{i}", "tps": rnd.choice([1, 1.04, 1.06, 2, 3]),
                 "blended_price_per_M": rnd.choice([0.001, 0.0049, 0.104, 0.096, 0.1]),
                 "aa_intelligence_index": 50} for i in range(8)]
        want = [m for m in rows if not any(o is not m and decide.dominates_cost_speed(o, m) for o in rows)]
        assert decide.cost_speed_pareto(rows) == want


def test_huge_integers_are_not_finite():
    assert decide.clamp_floor(10 ** 400) == decide.DEFAULT_INTELLIGENCE_FLOOR


@pytest.mark.parametrize("raw,want", [(float("nan"), 50.0), (float("inf"), 50.0), (-3, 0.0), (101, 100.0), (42, 42.0)])
def test_clamp_floor(raw, want):
    assert decide.clamp_floor(raw) == want


def test_floor_from_anchor_fails_closed():
    rows = [{"model": "a", "aa_intelligence_index": 61.5}, {"model": "b", "aa_intelligence_index": 140}]
    assert decide.floor_from_anchor(rows, "a") == 61.5
    assert decide.floor_from_anchor(rows, "b") is None
    assert decide.floor_from_anchor(rows, "missing") is None
