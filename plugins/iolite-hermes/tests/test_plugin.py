"""Plugin surface: registration, config, refusals, and tool output shape."""
import importlib.util
import json
import re
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
    p.write_text(json.dumps({"schema_version": "1", "models": GOLDEN["catalogs"]["mixed"]}))
    return p


def _setup(config):
    ctx = Ctx(config)
    plugin.register(ctx)
    plugin._cache.clear()
    plugin._failures.clear()
    return ctx


def test_registers_all_tools():
    assert set(_setup({}).tools) == {"iolite_shortlist", "iolite_model", "iolite_show"}


def test_installed_version_matches_the_desktop_and_plugin_manifests():
    _setup({"measure_speed": False})
    reported = plugin.landscape_state()["version"]
    manifest = (ROOT / "plugin.yaml").read_text()
    declared = re.search(r"^version:[ \t]*[\"']?([^\s\"']+)", manifest, re.M)
    assert declared and declared.group(1) == reported
    for path in ("dashboard/manifest.json", "desktop-src/package.json"):
        assert json.loads((ROOT / path).read_text())["version"] == reported, path


def test_no_source_configured_refuses_without_network(monkeypatch):

    def boom(*a, **k):
        raise AssertionError("network used with no catalog_url")
    monkeypatch.setattr(plugin.netio, "open_same_origin", boom)
    monkeypatch.setattr(plugin.urllib.request, "urlopen", boom)
    out = json.loads(_setup({"measure_speed": False}).tools["iolite_shortlist"]({}))
    assert out["ok"] is True and out["shortlist"] and out["mode"] == "cost"
    assert any("Epoch" in c for c in out["data_credits"])


def test_data_credits_carry_licence_links(monkeypatch):
    """Legal: CC BY credits must point to the licence and ATTRIBUTION.md."""

    def boom(*a, **k):
        raise AssertionError("network used with no catalog_url")
    monkeypatch.setattr(plugin.netio, "open_same_origin", boom)
    monkeypatch.setattr(plugin.urllib.request, "urlopen", boom)
    out = json.loads(_setup({"measure_speed": False}).tools["iolite_shortlist"]({}))
    joined = " ".join(out["data_credits"])
    assert "creativecommons.org/licenses/by/4.0" in joined
    assert "ATTRIBUTION.md" in joined


def test_shortlist_matches_decide_for_min_cost(catalog):
    ctx = _setup({"catalog_path": str(catalog)})
    out = json.loads(ctx.tools["iolite_shortlist"]({"floor": 50, "objective": "min_cost", "n": 3}))
    case = next(c for c in GOLDEN["cases"] if c["catalog"] == "mixed" and c["floor"] == 50 and c["bias"] == -1 and c["n"] == 3)
    assert [r["model"] for r in out["shortlist"]] == case["shortlist_ids"]
    assert out["floor_applied"] == {"intelligence": 50, "source": "user"}
    assert all(r["reasons"] == ["on_cost_front", "bias_cheap"] for r in out["shortlist"])
    assert out["mode"] == "cost"
    assert out["catalog_snapshot_id"] == GOLDEN["snapshot_id"]


def test_anchor_floor_and_unknown_anchor(catalog):
    ctx = _setup({"catalog_path": str(catalog)})
    out = json.loads(ctx.tools["iolite_shortlist"]({"anchor_model": "tie alpha", "objective": "max_speed"}))
    assert out["floor_applied"] == {"intelligence": 80.0, "source": "anchor"}
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

        body = json.dumps(GOLDEN["catalogs"]["mixed"]).encode()

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


def test_legal_f2_f3_disclosure_text():
    """Legal t_b99d20a1: SKILL.md tells the agent to pass data credits on (F2);
    README names every local route the pane calls (F3)."""
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    skill = (root / "skills" / "iolite" / "SKILL.md").read_text()
    assert "`data_credits`" in skill and "in your answer" in skill
    readme = (root / "README.md").read_text()
    assert "One local request" not in readme
    for route in ("/api/plugins/iolite/landscape", "/api/plugins/iolite/my-prices",
                  "/api/plugins/iolite/pane-receipt"):
        assert route in readme


def test_catalog_url_scores_public_api_v1_models_and_keeps_aa_refusal(monkeypatch):
    payload = {
        "schema_version": "1",
        "meta": {
            "catalog_date": "2026-11-11",
            "data_date": "2026-11-11",
            "plane": "public",
            "intelligence": {"field": "arena_rating", "label": "LMArena Bradley-Terry rating (style-controlled)"},
        },
        "models": [
            {
                "slug": "gemini-4-carbon-high",
                "model": "Gemini 4 Carbon (High)",
                "provider": "Google",
                "blended_price_per_M": 1.47,
                "price_in_per_M": 2,
                "price_out_per_M": 10,
                "price_cache_per_M": 0.1,
                "aa_intelligence_index": None,
                "arena_rating": 1526.0,
                "arena": {
                    "rating": 1526.0,
                    "metric": "LMArena Bradley-Terry rating (style-controlled)",
                    "source": "LMArena (Chatbot Arena) leaderboard — lmarena-ai/leaderboard-dataset",
                    "source_url": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
                    "license": "CC BY 4.0",
                    "as_of": "2026-11-09",
                },
                "sources": {
                    "blended_price_per_M": {
                        "origin": "litellm",
                        "kind": "derived",
                        "source_url": "https://aistudio.google.com/docs/pricing",
                        "license": "MIT",
                        "litellm_key": "gemini/gemini-4-carbon",
                    },
                    "arena_rating": {
                        "origin": "arena",
                        "kind": "measured",
                        "source_url": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
                        "license": "CC BY 4.0",
                        "as_of": "2026-11-09",
                    },
                },
                "null_reason": "intelligence (AA): not published — Artificial Analysis terms bar public redistribution",
            },
            {
                "slug": "flat-arena-only",
                "model": "Flat Arena Only",
                "provider": "TestLab",
                "blended_price_per_M": 0.5,
                "price_cache_per_M": 0.1,
                "aa_intelligence_index": None,
                "arena_rating": 1450.0,
                "sources": {
                    "blended_price_per_M": {"origin": "litellm", "kind": "derived", "license": "MIT"},
                    "arena_rating": {"origin": "arena", "kind": "measured", "license": "CC BY 4.0"},
                },
            },
            {
                "slug": "aa-leaked-row",
                "model": "AA Leaked",
                "provider": "BadLab",
                "blended_price_per_M": 0.1,
                "aa_intelligence_index": 99,
                "sources": {"aa_intelligence_index": {"origin": "Artificial Analysis", "kind": "measured"}},
            },
        ],
    }

    class Resp:
        def __init__(self, data: bytes):
            self._body = data

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self, n=-1):
            if n < 0:
                chunk, self._body = self._body, b""
            else:
                chunk, self._body = self._body[:n], self._body[n:]
            return chunk

    monkeypatch.setattr(plugin, "_url_opener", lambda req, t: Resp(json.dumps(payload).encode()))
    ctx = _setup({"catalog_url": "https://viz.kyanitelabs.tech/api/v1/models.json", "measure_speed": False})

    shortlist = json.loads(ctx.tools["iolite_shortlist"]({"floor": 50, "objective": "min_cost"}))
    assert shortlist["ok"] is True
    assert shortlist["scorable_count"] == 2
    assert shortlist["eligible_count"] == 2
    assert shortlist["refusals"] == []
    assert shortlist["rows_refused_for_provenance"] == 1
    assert shortlist["catalog_generated"] == "2026-11-11"
    assert "70%-cached blend" in shortlist["price_basis"]
    credits = " ".join(shortlist["data_credits"])
    assert "LMArena" in credits and "CC BY 4.0" in credits and "LiteLLM" in credits and "MIT" in credits

    lookup = json.loads(ctx.tools["iolite_model"]({"query": "gemini-4-carbon-high"}))
    assert lookup["total_matches"] == 1
    m = lookup["matches"][0]
    assert m["intelligence"] is not None and 85 <= m["intelligence"] <= 95
    assert m["arena_rating"] == 1526.0
    assert any("LMArena" in c for c in lookup["data_credits"])
