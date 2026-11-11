"""Task meter (tasks.json), measured-usage plan pricing, saving plans, price=mine and /iolite prices."""
import importlib.util
import json
import os
import stat
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("iolite_plugin_tasks", ROOT / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)


@pytest.fixture
def pd(tmp_path, monkeypatch):
    d = tmp_path / "pd"
    d.mkdir()
    monkeypatch.setattr(plugin, "_ctx", SimpleNamespace(state=SimpleNamespace(data_dir=str(d))))
    return d


def _call(model, task, tin, tout, sec):
    plugin._on_post_api_request(model=model, task_id=task, api_duration=sec,
                                usage={"input_tokens": tin, "output_tokens": tout})


def test_calls_add_up_per_task_and_model_with_hashed_ids(pd):
    _call("anthropic/claude-fable-5-2", "task-secret-1", 1000, 200, 2.0)
    _call("anthropic/claude-fable-5-2", "task-secret-1", 500, 100, 1.5)
    raw = (pd / plugin.TASKS_FILE).read_text()
    assert "task-secret-1" not in raw, "task ids are stored hashed"
    assert stat.S_IMODE(os.stat(pd / plugin.TASKS_FILE).st_mode) == 0o600
    (rec,) = plugin._read_tasks().values()
    assert (rec["in"], rec["out"], rec["calls"], rec["sec"]) == (1500, 300, 2, 3.5)


def test_per_task_medians_need_three_tasks_and_match_catalog_slugs(pd):
    for i, (tin, sec) in enumerate([(100, 1.0), (300, 3.0)]):
        _call("claude-fable-5-2", f"t{i}", tin, 50, sec)
    assert plugin._task_stats() == {}, "two tasks are not enough"
    _call("claude-fable-5-2", "t2", 200, 50, 2.0)
    st = plugin._task_stats()["claudefable52"]
    assert (st["n"], st["in"], st["out"], st["sec"]) == (3, 200, 50, 2.0)
    s = plugin.landscape_state()
    assert s["tasks"]["claude-fable-5.2"] == {"n": 3, "in": 200, "out": 50, "sec": 2.0}


def test_measure_usage_off_records_and_shows_nothing(pd, monkeypatch):
    monkeypatch.setattr(plugin, "_measure_usage_on", lambda: False)
    for i in range(4):
        _call("claude-fable-5-2", f"t{i}", 100, 50, 1.0)
    assert not (pd / plugin.TASKS_FILE).exists()
    assert plugin.landscape_state()["tasks"] == {}


def test_no_task_or_session_id_or_no_usage_records_nothing(pd):
    plugin._on_post_api_request(model="claude-fable-5-2", api_duration=1, usage={"input_tokens": 5})
    plugin._on_post_api_request(model="claude-fable-5-2", task_id="t", api_duration=1, usage=None)
    plugin._on_post_api_request(model="claude-fable-5-2", task_id="t", api_duration=1, usage="junk")
    assert plugin._read_tasks() == {}


def test_corrupt_tasks_file_never_raises(pd):
    (pd / plugin.TASKS_FILE).write_text("{nope")
    _call("claude-fable-5-2", "t", 10, 10, 1)
    assert len(plugin._read_tasks()) == 1


def test_amortized_without_usage_waits_then_prices_from_measured_tokens(pd):
    plugin.save_my_prices({"plans": [{"name": "Sub", "mode": "amortized", "paid_usd": 120, "period_months": 12,
                                      "match": ["claude-fable"]}]})
    mp = plugin.landscape_state()["my_prices"]
    assert mp["prices"] == {} and any("waiting for measured usage" in p for p in mp["problems"])
    _call("claude-fable-5-2", "t", 1_500_000, 500_000, 10)  # 2M tokens today
    mp = plugin.landscape_state()["my_prices"]
    plan = mp["plans"][0]
    assert plan["measured"]["early"] is True and plan["measured"]["days"] == 1
    # 2M tokens in 1 day scales to 60M a month; $10 a month / 60M = $0.1667/M
    assert plan["usd_per_m"] == pytest.approx(10 / 60)
    assert mp["prices"]["claude-fable-5.2"]["mode"] == "amortized"


def test_save_is_all_or_nothing_and_private(pd):
    bad = plugin.save_my_prices({"plans": [{"name": "ok", "mode": "sunk", "match": ["glm-"]},
                                           {"name": "bad", "mode": "fixed", "match": ["gpt-"]}]})
    assert bad["ok"] is False and not (pd / plugin.MY_PRICES_FILE).exists()
    assert plugin.save_my_prices("junk")["ok"] is False
    assert plugin.save_my_prices({"plans": [{}] * 41})["ok"] is False
    good = plugin.save_my_prices({"plans": [{"name": "GLM", "mode": "sunk", "match": ["glm-"], "extra": "dropped"}]})
    assert good["ok"] is True and good["my_prices"]["plans"][0]["covers"] > 0
    saved = json.loads((pd / plugin.MY_PRICES_FILE).read_text())
    assert "extra" not in saved["plans"][0]
    assert stat.S_IMODE(os.stat(pd / plugin.MY_PRICES_FILE).st_mode) == 0o600


def test_shortlist_price_mine_uses_plan_prices_and_says_so(pd):
    plugin.save_my_prices({"plans": [{"name": "Prepaid GLM", "mode": "sunk", "match": ["glm-"]}]})
    lst = json.loads(plugin.iolite_shortlist({"floor": 40, "objective": "min_cost", "price": "list"}))
    mine = json.loads(plugin.iolite_shortlist({"floor": 40, "objective": "min_cost", "price": "mine"}))
    assert lst["price_basis"].startswith("list price")
    assert "your own plan prices" in mine["price_basis"]
    assert mine["catalog_snapshot_id"] == lst["catalog_snapshot_id"]
    top = mine["shortlist"][0]
    assert "glm" in top["slug"].casefold() and top["blended_price_per_M"] == 0 and top["list_price_per_M"] > 0
    text = plugin._slash("shortlist 40 cheap price=mine")
    assert "Prices: your own plan prices" in text and "$0/M prepaid on Prepaid GLM" in text
    assert json.loads(plugin.iolite_shortlist({"price": "cheapest"}))["ok"] is False


def test_slash_prices_explains_each_plan(pd):
    assert "No plans yet" in plugin._slash("prices")
    plugin.save_my_prices({"plans": [
        {"name": "Fixed", "mode": "fixed", "usd_per_m": 0.5, "match": ["gpt-"]},
        {"name": "Sub", "mode": "amortized", "paid_usd": 60, "period_months": 12, "tokens_per_month_m": 10, "match": ["kimi-"]}]})
    out = plugin._slash("prices")
    assert "Fixed: $0.50/M, a price you set" in out
    assert "Sub: $0.50/M, $60 over 12 months / 10M tokens a month you set" in out
    assert "never shipped or uploaded" in out
