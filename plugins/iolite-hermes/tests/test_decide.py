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


def test_round_to_half_up_like_js():
    assert decide.round_to(0.125, 2) == 0.13
    assert decide.round_to(2.5, 0) == 3.0


@pytest.mark.parametrize("raw,want", [(float("nan"), 50.0), (float("inf"), 50.0), (-3, 0.0), (101, 100.0), (42, 42.0)])
def test_clamp_floor(raw, want):
    assert decide.clamp_floor(raw) == want


def test_floor_from_anchor_fails_closed():
    rows = [{"model": "a", "aa_intelligence_index": 61.5}, {"model": "b", "aa_intelligence_index": 140}]
    assert decide.floor_from_anchor(rows, "a") == 61.5
    assert decide.floor_from_anchor(rows, "b") is None
    assert decide.floor_from_anchor(rows, "missing") is None
