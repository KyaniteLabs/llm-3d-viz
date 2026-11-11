"""Plugin surface: registration, config, refusals, and tool output shape."""
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("iolite_plugin", ROOT / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)

GOLDEN = json.loads((ROOT / "tests" / "fixtures" / "decide-golden.json").read_text())


class Ctx:
    def __init__(self, config=None):
        self.config = config or {}
        self.tools = {}

    def get_config(self, key, default=None):
        return self.config.get(key, default)

    def register_tool(self, name, toolset, schema, handler, description="", emoji=""):
        assert toolset == "iolite" and schema["name"] == name and description
        self.tools[name] = handler


@pytest.fixture
def catalog(tmp_path):
    p = tmp_path / "models.json"
    p.write_text(json.dumps({"schema_version": "1", "models": GOLDEN["models"]}))
    return p


def _setup(config):
    ctx = Ctx(config)
    plugin.register(ctx)
    plugin._cache.clear()
    plugin._failures.clear()
    return ctx


def test_registers_both_tools():
    assert set(_setup({}).tools) == {"iolite_shortlist", "iolite_model"}


def test_no_source_configured_refuses_without_network(monkeypatch):
    monkeypatch.delenv("IOLITE_AA_API_KEY", raising=False)

    def boom(*a, **k):
        raise AssertionError("network used with no catalog_url")
    monkeypatch.setattr(plugin.aa_source, "open_same_origin", boom)
    monkeypatch.setattr(plugin.urllib.request, "urlopen", boom)
    out = json.loads(_setup({}).tools["iolite_shortlist"]({}))
    assert out["ok"] is False and "No catalog configured" in out["error"]


def test_shortlist_matches_decide_for_min_cost(catalog):
    ctx = _setup({"catalog_path": str(catalog)})
    out = json.loads(ctx.tools["iolite_shortlist"]({"floor": 50, "objective": "min_cost", "n": 3}))
    case = next(c for c in GOLDEN["cases"] if c["floor"] == 50 and c["bias"] == -1 and c["n"] == 3)
    assert [r["model"] for r in out["shortlist"]] == case["shortlist_ids"]
    assert out["floor_applied"] == {"aa_intelligence_index": 50, "source": "user"}
    assert all(r["reasons"] == ["on_pareto", "bias_cheap"] for r in out["shortlist"])
    assert out["catalog_snapshot_id"] == GOLDEN["snapshot_id"]


def test_anchor_floor_and_unknown_anchor(catalog):
    ctx = _setup({"catalog_path": str(catalog)})
    out = json.loads(ctx.tools["iolite_shortlist"]({"anchor_model": "tie alpha", "objective": "max_speed"}))
    assert out["floor_applied"] == {"aa_intelligence_index": 80.0, "source": "anchor"}
    assert out["shortlist"][0]["reasons"][1] == "bias_fast"
    bad = json.loads(ctx.tools["iolite_shortlist"]({"anchor_model": "nope"}))
    assert bad["ok"] is False


def test_impossible_floor_reports_refusal(catalog):
    out = json.loads(_setup({"catalog_path": str(catalog)}).tools["iolite_shortlist"]({"floor": 100}))
    assert out["shortlist"] == [] and out["refusals"] == ["no_pick_eligible_models"]


def test_bad_objective_and_n_cap(catalog):
    ctx = _setup({"catalog_path": str(catalog)})
    assert json.loads(ctx.tools["iolite_shortlist"]({"objective": "vibes"}))["ok"] is False
    out = json.loads(ctx.tools["iolite_shortlist"]({"floor": 0, "n": 999}))
    assert len(out["shortlist"]) <= plugin.MAX_N


def test_model_lookup(catalog):
    ctx = _setup({"catalog_path": str(catalog)})
    out = json.loads(ctx.tools["iolite_model"]({"query": "TIE ALPHA"}))
    assert {m["model"] for m in out["matches"]} == {"tie alpha", "Tie Alpha"}
    assert json.loads(ctx.tools["iolite_model"]({"query": ""}))["ok"] is False


def test_url_fetch_sends_no_credentials_and_caches(monkeypatch):
    calls = []

    class Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        body = json.dumps(GOLDEN["models"]).encode()

        def read(self, n):
            chunk, self.body = self.body[:n], self.body[n:]
            return chunk

    def fake_urlopen(req, timeout):
        calls.append(req)
        assert "Authorization" not in req.headers and "Cookie" not in req.headers
        return Resp()

    monkeypatch.setattr(plugin, "_url_opener", fake_urlopen)
    ctx = _setup({"catalog_url": "https://example.invalid/api/v1/models.json"})
    for _ in range(2):
        assert json.loads(ctx.tools["iolite_shortlist"]({}))["ok"] is True
    assert len(calls) == 1


def test_non_http_url_rejected():
    out = json.loads(_setup({"catalog_url": "file:///etc/passwd"}).tools["iolite_shortlist"]({}))
    assert out["ok"] is False and "http" in out["error"]
