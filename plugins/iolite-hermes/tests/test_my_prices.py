"""Personal price overlay: my_prices.json in the plugin data directory, read-only, never shipped."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("iolite_plugin_myprices", ROOT / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)


def _at(tmp_path, monkeypatch, body):
    d = tmp_path / "pd"
    d.mkdir()
    if body is not None:
        (d / plugin.MY_PRICES_FILE).write_text(body if isinstance(body, str) else json.dumps(body))
    monkeypatch.setattr(plugin, "_ctx", SimpleNamespace(state=SimpleNamespace(data_dir=str(d))))


def test_no_file_means_no_plans_and_no_problems(tmp_path, monkeypatch):
    _at(tmp_path, monkeypatch, None)
    assert plugin._read_my_prices() == {"plans": [], "problems": [], "revision": "missing", "skipped_plans": 0}
    assert plugin.landscape_state()["my_prices"]["prices"] == {}


def test_modes_price_correctly(tmp_path, monkeypatch):
    _at(tmp_path, monkeypatch, {"plans": [
        {"name": "Sunk", "mode": "sunk", "models": ["glm-5.3"]},
        {"name": "Amort", "mode": "amortized", "paid_usd": 120, "period_months": 12, "tokens_per_month_m": 50, "match": ["minimax-m"]},
        {"name": "Fixed", "mode": "fixed", "usd_per_m": 0.3, "match": ["kimi-k"]},
    ]})
    plans = {p["name"]: p["usd_per_m"] for p in plugin._read_my_prices()["plans"]}
    assert plans == {"Sunk": 0.0, "Amort": 0.2, "Fixed": 0.3}


def test_incomplete_or_unknown_plans_are_reported_not_guessed(tmp_path, monkeypatch):
    _at(tmp_path, monkeypatch, {"plans": [
        {"name": "No amount", "mode": "amortized", "period_months": 12, "match": ["glm"]},
        {"name": "Odd", "mode": "free-lunch", "match": ["glm"]},
        {"name": "Nothing matched", "mode": "sunk"},
        {"name": "Short frag", "mode": "sunk", "match": ["gl"]},
        "junk",
    ]})
    r = plugin._read_my_prices()
    assert r["plans"] == []
    assert len(r["problems"]) == 5
    assert any("paid_usd" in p for p in r["problems"])


def test_bad_json_and_oversize_never_raise(tmp_path, monkeypatch):
    _at(tmp_path, monkeypatch, "{not json")
    assert plugin._read_my_prices()["plans"] == []
    big = tmp_path / "pd" / plugin.MY_PRICES_FILE
    big.write_text(json.dumps({"plans": [], "pad": "x" * 70000}))
    assert plugin._read_my_prices()["problems"]


def test_overrides_exact_slug_beats_fragment_and_landscape_carries_them(tmp_path, monkeypatch):
    _at(tmp_path, monkeypatch, {"plans": [
        {"name": "Fragment", "mode": "fixed", "usd_per_m": 1, "match": ["glm-5"]},
        {"name": "Exact", "mode": "sunk", "models": ["glm-5.3"]},
    ]})
    rows = [{"slug": "glm-5.3"}, {"slug": "glm-5.2"}, {"slug": "gpt-x"}]
    o = plugin.my_price_overrides(rows, plugin._read_my_prices()["plans"])
    assert o["glm-5.3"]["plan"] == "Exact" and o["glm-5.3"]["usd_per_m"] == 0.0
    assert o["glm-5.2"]["plan"] == "Fragment"
    assert "gpt-x" not in o
    state = plugin.landscape_state()
    assert state["my_prices"]["prices"]["glm-5.3"]["mode"] == "sunk"
    assert [p["name"] for p in state["my_prices"]["plans"]] == ["Fragment", "Exact"]


def test_my_prices_never_ship_in_the_bundle():
    assert not list(ROOT.rglob(plugin.MY_PRICES_FILE))
    assert "my_prices" not in (ROOT / "desktop-src" / "src" / "snapshot.json").read_text()


def test_revision_stops_another_editor_overwriting_saved_plans(tmp_path, monkeypatch):
    _at(tmp_path, monkeypatch, None)
    first = {"name": "First plan", "mode": "sunk", "models": ["glm-5.3"]}
    second = {"name": "Second plan", "mode": "sunk", "models": ["glm-5.3"]}
    assert plugin.save_my_prices({"plans": [first]})["ok"]
    old = plugin.landscape_state()["my_prices"]["revision"]
    assert plugin.save_my_prices({"plans": [first, second], "revision": old})["ok"]
    conflicting = plugin.save_my_prices({"plans": [first], "revision": old})
    assert conflicting["ok"] is False
    assert [plan["name"] for plan in plugin.landscape_state()["my_prices"]["plans"]] == [
        "First plan", "Second plan",
    ]


def test_revision_missing_cannot_overwrite_an_unreadable_file(tmp_path, monkeypatch):
    _at(tmp_path, monkeypatch, None)
    revision = plugin.landscape_state()["my_prices"]["revision"]
    path = tmp_path / "pd" / plugin.MY_PRICES_FILE
    oversized = b" " * (plugin.MY_PRICES_MAX_BYTES + 1)
    path.write_bytes(oversized)
    assert plugin.save_my_prices({"plans": [], "revision": revision})["ok"] is False
    assert path.read_bytes() == oversized


def test_revision_missing_cannot_overwrite_a_new_valid_file(tmp_path, monkeypatch):
    _at(tmp_path, monkeypatch, None)
    revision = plugin.landscape_state()["my_prices"]["revision"]
    saved = tmp_path / "pd" / plugin.MY_PRICES_FILE
    contents = b'{"plans": []}'
    saved.write_bytes(contents)
    assert plugin.save_my_prices({"plans": [], "revision": revision})["ok"] is False
    assert saved.read_bytes() == contents


@pytest.mark.parametrize("extra", ["invalid plan", "over the limit"])
def test_save_refuses_to_discard_plans_skipped_during_read(tmp_path, monkeypatch, extra):
    valid = {"name": "Existing", "mode": "sunk", "models": ["glm-5.3"]}
    plans = [valid, {"name": "Bad plan", "mode": "sunk"}] if extra == "invalid plan" else [valid] * (plugin.MY_PRICES_MAX_PLANS + 1)
    _at(tmp_path, monkeypatch, {"plans": plans})
    state = plugin.landscape_state()["my_prices"]
    path = tmp_path / "pd" / plugin.MY_PRICES_FILE
    before = path.read_bytes()
    change = {"plans": [valid], "revision": state["revision"]}
    assert plugin.save_my_prices(change)["ok"] is False
    assert plugin.save_my_prices({"plans": [valid]})["ok"] is False
    assert state["skipped_plans"] == 1
    assert path.read_bytes() == before


def test_failed_parse_cannot_be_overwritten_from_editor(tmp_path, monkeypatch):
    _at(tmp_path, monkeypatch, "{not json")
    state = plugin.landscape_state()["my_prices"]
    path = tmp_path / "pd" / plugin.MY_PRICES_FILE
    before = path.read_bytes()
    assert plugin.save_my_prices({"plans": [], "revision": state["revision"]})["ok"] is False
    assert plugin.save_my_prices({"plans": []})["ok"] is False
    assert state["revision"] is None
    assert path.read_bytes() == before


def test_measured_usage_notice_does_not_block_editor_save(tmp_path, monkeypatch):
    plan = {"name": "Subscription", "mode": "amortized", "paid_usd": 12, "period_months": 1, "match": ["glm"]}
    _at(tmp_path, monkeypatch, {"plans": [plan]})
    state = plugin.landscape_state()["my_prices"]
    assert any("waiting for measured usage" in note for note in state["problems"])
    assert plugin.save_my_prices({"plans": [plan], "revision": state["revision"]})["ok"]


@pytest.mark.parametrize("partial", [
    {"models": ["glm-5.3"] * 201},
    {"match": ["glm"] * 41},
    {"match": ["glm", "g"]},
    {"match": "glm"},
    {"match": ["glm,example"]},
    {"match": ["=glm-5.3"]},
    {"tokens_per_month_m": "50"},
    {"custom_note": "keep this annotation"},
    {"name": "a" * 81},
])
def test_save_preserves_a_file_with_a_partly_representable_plan(tmp_path, monkeypatch, partial):
    plan = {"name": "Existing", "mode": "amortized", "paid_usd": 36, "period_months": 18, "models": ["glm-5.3"]}
    _at(tmp_path, monkeypatch, {"plans": [{**plan, **partial}]})
    path = tmp_path / "pd" / plugin.MY_PRICES_FILE
    original = path.read_bytes()
    state = plugin.landscape_state()["my_prices"]
    assert plugin.save_my_prices({"plans": [plan], "revision": state["revision"]})["ok"] is False
    assert state["skipped_plans"] == 1
    assert len(state["plans"]) == 1, "the usable plan remains available for pricing"
    assert path.read_bytes() == original


def test_save_allows_normalizing_case_spacing_and_optional_empty_values(tmp_path, monkeypatch):
    plan = {"name": "  Existing   plan  ", "mode": "amortized", "paid_usd": 36,
            "period_months": 2, "models": [" Glm-5.3 "], "match": None, "tokens_per_month_m": None}
    _at(tmp_path, monkeypatch, {"plans": [plan]})
    state = plugin.landscape_state()["my_prices"]
    assert state["skipped_plans"] == 0
    assert plugin.save_my_prices({"plans": state["plans"], "revision": state["revision"]})["ok"]
    saved = plugin.landscape_state()["my_prices"]["plans"][0]
    assert (saved["name"], saved["period_months"], saved["models"]) == ("Existing plan", 2, ["glm-5.3"])
