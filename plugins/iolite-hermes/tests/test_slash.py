"""/iolite slash command, skill registration, settings fallback and input clamps."""
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("iolite_plugin_slash", ROOT / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)

GOLDEN = json.loads((ROOT / "tests" / "fixtures" / "decide-golden.json").read_text())


class FullCtx:
    def __init__(self, config=None):
        self.config = config or {}
        self.tools, self.commands, self.skills = {}, {}, {}

    def get_config(self, key, default=None):
        return self.config.get(key, default)

    def register_tool(self, name, toolset, schema, handler, description="", emoji=""):
        self.tools[name] = handler

    def register_command(self, name, handler, description="", args_hint=""):
        assert description and args_hint
        self.commands[name] = handler

    def register_skill(self, name, path, description="", frontmatter=None):
        assert Path(path).is_file()
        self.skills[name] = Path(path)


@pytest.fixture
def ctx(tmp_path):
    p = tmp_path / "models.json"
    p.write_text(json.dumps({"models": GOLDEN["models"]}))
    c = FullCtx({"catalog_path": str(p)})
    plugin.register(c)
    plugin._cache.clear()
    plugin._failures.clear()
    return c


def slash(ctx, text):
    return ctx.commands["iolite"](text)


def test_registers_command_and_skill(ctx):
    assert set(ctx.commands) == {"iolite"}
    assert set(ctx.skills) == {"iolite"}
    body = ctx.skills["iolite"].read_text()
    assert body.startswith("---\nname: iolite\n") and "iolite_shortlist" in body


def test_old_ctx_without_command_or_skill_still_loads():
    class Old:
        tools = {}

        def get_config(self, key, default=None):
            return default

        def register_tool(self, name, **kw):
            self.tools[name] = kw["handler"]

    old = Old()
    plugin.register(old)
    assert set(old.tools) == {"iolite_shortlist", "iolite_model"}


@pytest.mark.parametrize("text", ["", "help", "--help"])
def test_help(ctx, text):
    assert "/iolite shortlist" in slash(ctx, text)


def test_shortlist_matches_the_tool(ctx):
    out = slash(ctx, "shortlist 50 cheap n=3")
    tool = json.loads(ctx.tools["iolite_shortlist"]({"floor": 50, "objective": "min_cost", "n": 3}))
    assert out.startswith("Floor 50 (user), min_cost:")
    for i, m in enumerate(tool["shortlist"], 1):
        assert f"{i}. {m['model']} (" in out
    assert "Artificial Analysis" not in out  # no attribution for a local file


def test_shortlist_anchor_with_quotes(ctx):
    out = slash(ctx, 'shortlist "tie alpha" fast')
    assert out.startswith("Floor 80 (anchor), max_speed:")


def test_shortlist_bad_inputs_are_explained(ctx):
    assert "n must be a whole number" in slash(ctx, "shortlist n=lots")
    assert "bias must be a number" in slash(ctx, "shortlist bias=up")
    assert "could not read" in slash(ctx, 'shortlist "unclosed')
    assert "not found" in slash(ctx, "shortlist no-such-model")


def test_empty_shortlist_says_why(ctx):
    assert "none reaches the floor" in slash(ctx, "shortlist 100")


def test_model_lookup_and_unknown(ctx):
    assert "tie alpha" in slash(ctx, "model TIE ALPHA")
    assert slash(ctx, "model zzz-none") == "No model matches that name."
    assert "Name a model" in slash(ctx, "model")


def test_status_makes_no_network_call(ctx, monkeypatch):
    monkeypatch.setattr(plugin.netio, "open_same_origin", lambda *a, **k: pytest.fail("network"))
    out = slash(ctx, "status")
    assert f"Iolite {plugin.VERSION}" in out and "catalog_path" in out


def test_unknown_subcommand(ctx):
    assert slash(ctx, "dance").startswith("Unknown subcommand 'dance'")


def test_slash_never_raises(ctx, monkeypatch):
    monkeypatch.setattr(plugin, "iolite_shortlist", lambda *a, **k: 1 / 0)
    assert "unexpected error" in slash(ctx, "shortlist")


@pytest.mark.parametrize("n,want", [(0, 1), (-5, 1), (2.9, 2), (999, plugin.MAX_N), (True, 3),
                                    ("4", 4), (None, 3), (float("nan"), 3), (float("inf"), 3)])
def test_clamp_n(n, want):
    assert plugin._clamp_n(n) == want


def test_n_zero_still_returns_one(ctx):
    out = json.loads(ctx.tools["iolite_shortlist"]({"floor": 0, "n": 0}))
    assert len(out["shortlist"]) == 1


@pytest.mark.parametrize("val", ["soon", -3, None, float("nan")])
def test_bad_numeric_settings_fall_back(val):
    c = FullCtx({"cache_minutes": val, "timeout_seconds": val})
    plugin.register(c)
    assert plugin._num_cfg("cache_minutes") == plugin.DEFAULTS["cache_minutes"]
    assert plugin._timeout() == plugin.DEFAULTS["timeout_seconds"]


def test_settings_fall_back_to_config_without_ctx(monkeypatch):
    monkeypatch.setattr(plugin, "_ctx", None)
    monkeypatch.setattr(plugin, "_settings_from_config", lambda: {"catalog_url": "https://x.invalid/m.json"})
    assert plugin._cfg("catalog_url") == "https://x.invalid/m.json"
    assert plugin._cfg("cache_minutes") == plugin.DEFAULTS["cache_minutes"]


def test_missing_catalog_error_names_the_real_config_path(monkeypatch):
    c = FullCtx({})
    plugin.register(c)
    err = json.loads(c.tools["iolite_shortlist"]({}))["error"]
    assert "plugins.entries.iolite.settings" in err
