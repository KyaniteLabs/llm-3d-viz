"""Personal price overlay: my_prices.json in the plugin data directory, read-only, never shipped."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

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
    assert plugin._read_my_prices() == {"plans": [], "problems": []}
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
