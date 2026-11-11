"""The Desktop landscape pane's Python side: remembered shortlist, REST snapshot, snapshot builder."""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("iolite_plugin_landscape", ROOT / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)

CATALOG = json.loads((ROOT / "data" / "catalog.json").read_text())


class Ctx:
    def __init__(self, config=None, data_dir=None):
        self.config = config or {}
        self.state = SimpleNamespace(data_dir=data_dir) if data_dir else None
        self.tools, self.commands, self.hooks = {}, {}, {}

    def get_config(self, key, default=None):
        return self.config.get(key, default)

    def register_tool(self, name, toolset, schema, handler, description="", emoji=""):
        self.tools[name] = handler

    def register_command(self, name, handler, description="", args_hint=""):
        self.commands[name] = handler

    def register_hook(self, name, fn):
        self.hooks[name] = fn

    def register_skill(self, *a, **k):
        pass


def _setup(tmp_path, config=None):
    c = Ctx(config, data_dir=str(tmp_path / "pd"))
    plugin.register(c)
    return c


def _measure(c, model, n=3, tokens=100, seconds=1.0):
    for _ in range(n):
        c.hooks["post_api_request"](model=model, api_duration=seconds, usage={"output_tokens": tokens})


def test_shortlist_is_remembered_with_only_floor_and_slugs(tmp_path):
    c = _setup(tmp_path)
    out = json.loads(c.tools["iolite_shortlist"]({"floor": 70, "limit": 3}))
    assert out["ok"]
    f = tmp_path / "pd" / plugin.LAST_SHORTLIST_FILE
    assert (f.stat().st_mode & 0o777) == 0o600
    rec = json.loads(f.read_text())
    assert rec["floor"] == 70 and rec["floor_source"] == "user"
    assert rec["picks"] == [m["slug"] for m in out["shortlist"]]
    assert set(rec) == {"version", "saved", "floor", "floor_source", "objective", "mode", "picks"}
    assert [p.name for p in (tmp_path / "pd").iterdir()] == [plugin.LAST_SHORTLIST_FILE]  # no temp files


def test_remember_shortlist_off_writes_nothing(tmp_path):
    c = _setup(tmp_path, {"remember_shortlist": False})
    c.tools["iolite_shortlist"]({"floor": 70})
    assert not (tmp_path / "pd" / plugin.LAST_SHORTLIST_FILE).exists()


def test_a_failed_shortlist_is_not_remembered(tmp_path):
    c = _setup(tmp_path)
    out = json.loads(c.tools["iolite_shortlist"]({"anchor_model": "no such model anywhere"}))
    assert not out["ok"]
    assert not (tmp_path / "pd" / plugin.LAST_SHORTLIST_FILE).exists()


@pytest.mark.parametrize("raw", ["not json", "[]", '{"picks": "x"}', '{"picks": []}' + " " * 70000])
def test_malformed_remembered_file_reads_as_none_or_empty(tmp_path, raw):
    c = _setup(tmp_path)
    d = tmp_path / "pd"
    d.mkdir(parents=True)
    (d / plugin.LAST_SHORTLIST_FILE).write_text(raw)
    got = plugin._read_last_shortlist()
    assert got is None or got["picks"] == []


def test_remembered_values_are_validated(tmp_path):
    _setup(tmp_path)
    d = tmp_path / "pd"
    d.mkdir(parents=True)
    (d / plugin.LAST_SHORTLIST_FILE).write_text(json.dumps(
        {"picks": ["a", 5, None, "b"], "floor": 999, "floor_source": "user", "objective": "balanced"}))
    got = plugin._read_last_shortlist()
    assert got["picks"] == ["a", "b"] and got["floor"] is None


def test_landscape_state_has_no_speed_until_three_samples(tmp_path):
    c = _setup(tmp_path)
    slug = next(r["slug"] for r in CATALOG["models"] if r.get("price") and r.get("intelligence"))
    s = plugin.landscape_state()
    assert s["ok"] and s["bundled"] and s["speed"] == {} and s["last_shortlist"] is None
    _measure(c, slug, n=2)
    assert plugin.landscape_state()["speed"] == {}          # too few samples: never estimated
    _measure(c, slug, n=1)
    s = plugin.landscape_state()
    assert s["speed"][slug]["tps"] == 100.0
    assert set(s["speed"]) == {slug}                          # only the measured model


def test_landscape_state_with_measure_speed_off_is_empty(tmp_path):
    c = _setup(tmp_path, {"measure_speed": False})
    _measure(c, CATALOG["models"][0]["slug"])
    s = plugin.landscape_state()
    assert s["measure_speed"] is False and s["speed"] == {}


def test_landscape_state_survives_a_broken_catalog(tmp_path):
    _setup(tmp_path, {"catalog_path": str(tmp_path / "missing.json")})
    s = plugin.landscape_state()
    assert s["ok"] and s["bundled"] is False and s["speed"] == {}


def test_dashboard_route_returns_the_snapshot(tmp_path):
    pytest.importorskip("fastapi")
    spec2 = importlib.util.spec_from_file_location("iolite_dashboard_api", ROOT / "dashboard" / "plugin_api.py")
    api = importlib.util.module_from_spec(spec2)
    spec2.loader.exec_module(api)
    assert [r.path for r in api.router.routes] == ["/landscape"]
    out = api.landscape()
    assert out["ok"] is True and "speed" in out and "last_shortlist" in out


def test_dashboard_manifest_matches_the_plugin_name():
    m = json.loads((ROOT / "dashboard" / "manifest.json").read_text())
    assert m["name"] == "iolite" and m["api"] == "plugin_api.py"


def test_desktop_snapshot_is_current_and_carries_no_speed():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "build_snapshot.py"), "--check"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    snap = json.loads((ROOT / "desktop-src" / "src" / "snapshot.json").read_text())
    blob = json.dumps(snap).casefold()
    assert "artificial analysis" not in blob and "tps" not in blob
    assert snap["total"] == len(CATALOG["models"]) and snap["plotted"] + snap["unplotted"] == snap["total"]
    names = [m["n"] for m in snap["models"]]
    assert len(names) == len(set(names)) == snap["plotted"]


def test_desktop_front_fixture_matches_decide(tmp_path):
    _setup(tmp_path)
    fixture = json.loads((ROOT / "desktop-src" / "test" / "fixtures" / "front.json").read_text())
    dspec = importlib.util.spec_from_file_location("iolite_decide_l", ROOT / "decide.py")
    decide = importlib.util.module_from_spec(dspec)
    dspec.loader.exec_module(decide)
    rows = [dict(r) for r in plugin.load_catalog()[0]]
    got = sorted(r["slug"] for r in decide.cost_intelligence_pareto(rows))
    assert got == sorted(fixture["front"]) and got
