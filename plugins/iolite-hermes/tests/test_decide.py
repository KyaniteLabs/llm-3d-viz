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
MODELS = GOLDEN["catalogs"]["mixed"]


def test_default_floor_matches_fork_defaults():
    assert decide.DEFAULT_INTELLIGENCE_FLOOR == GOLDEN["default_floor"]


@pytest.mark.parametrize("case", GOLDEN["cases"],
                         ids=lambda c: f"{c['catalog']}-f{c['floor']}-b{c['bias']}-n{c['n']}")
def test_shortlist_parity(case):
    out = decide.shortlist_from_decide(GOLDEN["catalogs"][case["catalog"]], case["floor"], case["bias"], case["n"])
    assert out["mode"] == case["mode"]
    assert [m["model"] for m in out["eligible"]] == case["eligible_ids"]
    assert [m["model"] for m in out["pareto"]] == case["pareto_ids"]
    assert [m["model"] for m in out["shortlist"]] == case["shortlist_ids"]


def test_snapshot_payload_and_id_parity():
    assert decide.catalog_snapshot_payload(MODELS) == GOLDEN["snapshot_payload"]
    assert decide.catalog_snapshot_id(MODELS) == GOLDEN["snapshot_id"]


def test_dominance_uses_full_precision():
    cheap_slow = {"model": "a", "tps": 1, "blended_price_per_M": 0.001, "intelligence": 90}
    dear_fast = {"model": "b", "tps": 2, "blended_price_per_M": 0.0049, "intelligence": 90}
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
                 "intelligence": 50} for i in range(8)]
        want = [m for m in rows if not any(o is not m and decide.dominates_cost_speed(o, m) for o in rows)]
        assert decide.cost_speed_pareto(rows) == want


def test_huge_integers_are_not_finite():
    assert decide.clamp_floor(10 ** 400) == decide.DEFAULT_INTELLIGENCE_FLOOR


@pytest.mark.parametrize("raw,want", [(float("nan"), 50.0), (float("inf"), 50.0), (-3, 0.0), (101, 100.0), (42, 42.0)])
def test_clamp_floor(raw, want):
    assert decide.clamp_floor(raw) == want


def test_floor_from_anchor_fails_closed():
    rows = [{"model": "a", "intelligence": 61.5}, {"model": "b", "intelligence": 140}]
    assert decide.floor_from_anchor(rows, "a") == 61.5
    assert decide.floor_from_anchor(rows, "b") is None
    assert decide.floor_from_anchor(rows, "missing") is None


def _row(name, tps, price, intel):
    return {"model": name, "tps": tps, "blended_price_per_M": price, "intelligence": intel}


def test_both_modes_are_exercised_by_the_golden():
    assert {c["mode"] for c in GOLDEN["cases"]} == {"cost_speed", "cost"}


def test_no_speed_ranks_the_cost_x_intelligence_front():
    rows = [_row("cheap", None, 0.5, 60), _row("mid", None, 2, 80), _row("smart", None, 9, 95),
            _row("dominated", None, 3, 70), _row("below", None, 0.1, 10)]
    out = decide.shortlist_from_decide(rows, 50, -1, 3)
    assert out["mode"] == "cost"
    assert sorted(m["model"] for m in out["pareto"]) == ["cheap", "mid", "smart"]
    assert out["shortlist"][0]["model"] == "cheap"
    assert decide.shortlist_from_decide(rows, 50, 1, 3)["shortlist"][0]["model"] == "smart"


def test_speed_is_used_only_when_every_candidate_has_it():
    fast = [_row("a", 10, 1, 60), _row("b", 90, 4, 60)]
    assert decide.shortlist_from_decide(fast, 50, 0, 3)["mode"] == "cost_speed"
    assert decide.shortlist_from_decide(fast + [_row("c", None, 0.2, 60)], 50, 0, 3)["mode"] == "cost"


def test_deprecated_aa_intelligence_index_alias_is_read():
    old = {"model": "o", "tps": 5, "blended_price_per_M": 1, "aa_intelligence_index": 77}
    assert decide.intelligence_of(old) == 77 and decide.is_scorable(old)
    assert decide.intelligence_of({**old, "intelligence": 55}) == 55  # the new name wins
    assert decide.floor_from_anchor([old], "o") == 77
    new = {**old}
    new["intelligence"] = new.pop("aa_intelligence_index")
    assert decide.catalog_snapshot_payload([old]) == decide.catalog_snapshot_payload([new])
