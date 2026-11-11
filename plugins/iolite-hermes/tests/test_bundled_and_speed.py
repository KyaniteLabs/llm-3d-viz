"""The bundled catalog, the nested catalog schema, and local speed measurement."""
import importlib.util
import json
import re
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("iolite_plugin_bundled", ROOT / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)

CATALOG = json.loads((ROOT / "data" / "catalog.json").read_text())


class Ctx:
    def __init__(self, config=None, data_dir=None, hooks=True):
        self.config = config or {}
        self.state = SimpleNamespace(data_dir=data_dir) if data_dir else None
        self.tools, self.commands, self.hooks = {}, {}, {}
        if not hooks:
            self.register_hook = None

    def get_config(self, key, default=None):
        return self.config.get(key, default)

    def register_tool(self, name, toolset, schema, handler, description="", emoji=""):
        self.tools[name] = handler

    def register_command(self, name, handler, description="", args_hint=""):
        self.commands[name] = handler

    def register_skill(self, *a, **k):
        pass

    def register_hook(self, name, fn):
        self.hooks[name] = fn


def _call(ctx, n=60, tokens=200, seconds=2.0, model="gpt-6.1-terra"):
    for _ in range(n):
        ctx.hooks["post_api_request"](model=model, api_duration=seconds, usage={"output_tokens": tokens})


# ---- bundled catalog ----

def test_bundled_catalog_has_no_forbidden_sources():
    text = (ROOT / "data" / "catalog.json").read_text() + (ROOT / "ATTRIBUTION.md").read_text()
    assert not re.search(r"artificial|openrouter|tensormesh", text, re.I)


def test_bundled_catalog_is_full_of_pickable_rows():
    both = [r for r in CATALOG["models"] if r.get("intelligence") and r.get("price")]
    assert len(both) >= 80 and len(CATALOG["models"]) >= 400
    assert all(r["intelligence"]["license"] and r["price"]["license"] for r in both)
    assert not any("speed" in r or "tps" in r for r in CATALOG["models"])  # no public speed source


def test_fresh_install_gives_a_real_answer_with_credits():
    c = Ctx({"measure_speed": False})
    plugin.register(c)
    out = json.loads(c.tools["iolite_shortlist"]({}))
    assert out["ok"] and out["shortlist"] and out["eligible_count"] > 50
    credits = " ".join(out["data_credits"])
    assert "Epoch" in credits and "MIT" in credits
    text = c.commands["iolite"]("model Claude Opus 4.6")
    assert "Bradley-Terry" in text and "Elo" not in text and "CC BY 4.0" in text


def test_status_lists_the_sources_and_speed_state():
    c = Ctx({"measure_speed": False})
    plugin.register(c)
    s = c.commands["iolite"]("status")
    assert "bundled" in s and "CC BY" in s and "MIT" in s and "off" in s.lower()


# ---- nested schema and deprecated alias ----

def test_nested_rows_are_flattened(tmp_path):
    row = {"model": "N", "intelligence": {"value": 71.5, "metric": "ECI", "source": "Epoch"},
           "price": {"blended_per_M": 1.25, "litellm_provider": "x"}, "context_length": 1000}
    p = tmp_path / "c.json"
    p.write_text(json.dumps({"models": [row]}))
    c = Ctx({"catalog_path": str(p), "measure_speed": False})
    plugin.register(c)
    out = json.loads(c.tools["iolite_shortlist"]({"floor": 0}))
    assert out["shortlist"][0]["model"] == "N"
    assert out["shortlist"][0]["intelligence"] == 71.5


def test_deprecated_alias_still_loads(tmp_path):
    p = tmp_path / "c.json"
    p.write_text(json.dumps([{"model": "Old", "aa_intelligence_index": 66, "blended_price_per_M": 2}]))
    c = Ctx({"catalog_path": str(p), "measure_speed": False})
    plugin.register(c)
    out = json.loads(c.tools["iolite_shortlist"]({"floor": 0}))
    assert out["shortlist"][0]["intelligence"] == 66


# ---- speed hook ----

def test_hook_is_registered_and_register_survives_a_ctx_without_hooks():
    c = Ctx()
    plugin.register(c)
    assert "post_api_request" in c.hooks
    plugin.register(Ctx(hooks=False))  # an older Hermes: no crash


def test_rolling_median_atomic_file_and_data_dir(tmp_path):
    d = tmp_path / "pd"
    c = Ctx(data_dir=str(d))
    plugin.register(c)
    _call(c, n=30, tokens=100, seconds=1.0)   # 100 tps
    _call(c, n=1, tokens=400, seconds=1.0)    # 400 tps, one outlier among 25 kept
    f = d / "speed.json"
    data = json.loads(f.read_text())
    entry = next(iter(data["models"].values()))
    assert entry["n"] == plugin.SPEED_WINDOW and entry["median_tps"] == 100.0
    assert (f.stat().st_mode & 0o777) == 0o600
    assert [p.name for p in d.iterdir()] == ["speed.json"]  # no temp files left


def test_opt_out_records_nothing(tmp_path):
    c = Ctx({"measure_speed": False}, data_dir=str(tmp_path / "pd"))
    plugin.register(c)
    _call(c, n=5)
    assert not (tmp_path / "pd").exists()


@pytest.mark.parametrize("kw", [
    {"usage": None}, {"usage": "x"}, {"usage": {"output_tokens": "many"}},
    {"usage": {"output_tokens": 5}}, {"usage": {"output_tokens": 500}, "api_duration": 0.0},
    {"usage": {"output_tokens": 10 ** 9}, "api_duration": 1.0}, {"model": None},
])
def test_malformed_usage_is_ignored_and_never_raises(tmp_path, kw):
    c = Ctx(data_dir=str(tmp_path / "pd"))
    plugin.register(c)
    args = {"model": "m", "api_duration": 1.0, "usage": {"output_tokens": 100}}
    args.update(kw)
    c.hooks["post_api_request"](**args)
    assert not (tmp_path / "pd").exists()


def test_hook_works_without_a_ctx_state_using_hermes_home(tmp_path):
    c = Ctx()
    plugin.register(c)
    _call(c, n=3)
    assert (tmp_path / "hermes-home" / "plugin-data" / "iolite" / "speed.json").is_file()


def test_local_speed_is_merged_labelled_and_switches_mode(tmp_path):
    c = Ctx(data_dir=str(tmp_path / "pd"))
    plugin.register(c)
    out = json.loads(c.tools["iolite_shortlist"]({}))
    assert out["mode"] == "cost" and out["speed"] == "not measured yet"
    for r in CATALOG["models"]:                      # measure every model that has a price
        if r.get("price") and r.get("intelligence"):
            _call(c, n=3, model=r["slug"])
    out = json.loads(c.tools["iolite_shortlist"]({}))
    assert out["mode"] == "cost_speed"
    assert "measured locally on this machine" in json.dumps(out)
    assert "not comparable across machines" in c.commands["iolite"]("shortlist")


def test_too_few_samples_are_not_shown(tmp_path):
    c = Ctx(data_dir=str(tmp_path / "pd"))
    plugin.register(c)
    _call(c, n=2)
    out = json.loads(c.tools["iolite_shortlist"]({}))
    assert out["mode"] == "cost"
