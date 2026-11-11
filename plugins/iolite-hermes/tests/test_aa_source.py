"""Bring-your-own Artificial Analysis key: mapping, paging, errors, key hygiene."""
import importlib.util
import io
import json
import urllib.error
from email.message import Message
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("iolite_plugin_aa", ROOT / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)
aa = plugin.aa_source

PAGES = json.loads((ROOT / "tests" / "fixtures" / "aa-free-pages.json").read_text())["pages"]
KEY = "test-key-not-real-0123456789"


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeAA:
    def __init__(self, pages=PAGES, error=None):
        self.pages, self.error, self.calls = pages, error, []

    def __call__(self, req, timeout):
        self.calls.append(req)
        assert req.full_url.startswith(aa.FREE_URL + "?page=")
        assert req.get_header("X-api-key") == KEY
        if self.error:
            raise self.error
        page = int(req.full_url.rsplit("=", 1)[1])
        return Resp(json.dumps(self.pages[page - 1]).encode())


class Ctx:
    def __init__(self, config=None):
        self.config, self.tools = config or {}, {}

    def get_config(self, key, default=None):
        return self.config.get(key, default)

    def register_tool(self, name, toolset, schema, handler, description="", emoji=""):
        self.tools[name] = handler


@pytest.fixture
def setup(monkeypatch):
    def _setup(fake, config=None, key=KEY):
        if key:
            monkeypatch.setenv(aa.ENV_KEY, key)
        else:
            monkeypatch.delenv(aa.ENV_KEY, raising=False)
        monkeypatch.setattr(plugin, "_aa_opener", fake)
        ctx = Ctx(config)
        plugin.register(ctx)
        plugin._cache.clear()
        plugin._failures.clear()
        return ctx
    return _setup


def test_blend_is_7_2_1_and_zero_cache_falls_back_to_input():
    assert aa.blended_price(2.0, 8.0, 0.5) == pytest.approx((0.5 * 7 + 2.0 * 2 + 8.0) / 10)
    assert aa.blended_price(0.2, 0.8, 0) == pytest.approx((0.2 * 9 + 0.8) / 10)
    assert aa.blended_price(0.2, 0.8, None) == pytest.approx((0.2 * 9 + 0.8) / 10)
    assert aa.blended_price(None, 0.8, 0.1) is None
    assert aa.blended_price(-1, 0.8, 0.1) is None


def test_map_prefers_v3_speed_and_converts_ttft_to_ms():
    alpha, beta = (aa.map_row(m, "2026-11-10") for m in PAGES[0]["data"])
    assert alpha["tps"] == 90.0 and alpha["ttft"] == pytest.approx(1200.0)
    assert alpha["provider"] == "Alpha Lab" and alpha["aa_intelligence_index"] == 70.0
    assert alpha["source_url"] == "https://artificialanalysis.ai/models/alpha-large"
    assert beta["tps"] == 300.0 and beta["ttft"] == pytest.approx(300.0)


def test_map_drops_nameless_rows_and_keeps_nulls():
    gamma, nameless = (aa.map_row(m, "2026-11-10") for m in PAGES[1]["data"])
    assert nameless is None
    assert gamma["tps"] is None and gamma["blended_price_per_M"] == pytest.approx(0.055)


def _catalog(tmp_path):
    """A catalog whose numbers differ from the Artificial Analysis fixture, so any
    leak of AA values into the ranking would change the result."""
    p = tmp_path / "m.json"
    p.write_text(json.dumps([
        {"model": "Alpha Large", "slug": "alpha-large", "provider": "Alpha Lab", "tps": 50,
         "blended_price_per_M": 5, "aa_intelligence_index": 80},
        {"model": "Beta Fast", "slug": "beta-fast", "provider": "Beta", "tps": 400,
         "blended_price_per_M": 9, "aa_intelligence_index": 75},
        {"model": "Local Only", "tps": 120, "blended_price_per_M": 1, "aa_intelligence_index": 60},
    ]))
    return {"catalog_path": str(p)}


def _run(setup, fake, tmp_path, key=KEY, tool="iolite_shortlist", args=None):
    ctx = setup(fake, _catalog(tmp_path), key=key)
    return json.loads(ctx.tools[tool](args if args is not None else {"floor": 50}))


def test_ranking_is_byte_identical_with_and_without_a_key(setup, tmp_path):
    """Legal t_6f43f08d: Artificial Analysis is display only, never a ranking input."""
    for args in ({"floor": 50}, {"floor": 50, "objective": "max_speed"},
                 {"anchor_model": "beta-fast", "objective": "min_cost", "n": 5}):
        with_key = _run(setup, FakeAA(), tmp_path, args=args)
        without = _run(setup, FakeAA(), tmp_path, key="", args=args)
        assert with_key["ok"] and without["ok"]
        assert json.dumps(with_key["shortlist"]) == json.dumps(without["shortlist"])
        for k in ("floor_applied", "eligible_count", "pareto_count", "catalog_snapshot_id", "cost_speed_bias"):
            assert with_key[k] == without[k]
    assert "aa_display" not in without and "attribution" not in without


def test_aa_numbers_never_enter_the_picks(setup, tmp_path):
    out = _run(setup, FakeAA(), tmp_path, args={"floor": 70})
    # Catalog says Alpha is index 80 / $5; Artificial Analysis says 70 / other. The pick keeps the catalog's.
    alpha = next(r for r in out["shortlist"] if r["model"] == "Alpha Large")
    assert alpha["aa_intelligence_index"] == 80 and alpha["blended_price_per_M"] == 5
    shown = out["aa_display"]["Alpha Large"]
    assert shown["intelligence_index"] == 70.0 and "display only" in shown["label"]
    out2 = _run(setup, FakeAA(), tmp_path, args={"floor": 0})
    assert "Local Only" in [r["model"] for r in out2["shortlist"]]
    assert "Local Only" not in out2["aa_display"]  # not in Artificial Analysis: nothing shown
    assert out["attribution"]["text"] == "Source: Artificial Analysis (artificialanalysis.ai)"
    assert out["catalog_source"].startswith("file:")


def test_one_fetch_per_answer_and_no_cache(setup, tmp_path):
    fake = FakeAA()
    ctx = setup(fake, _catalog(tmp_path))
    ctx.tools["iolite_shortlist"]({"floor": 50})
    assert len(fake.calls) == 2  # two pages for one answer
    ctx.tools["iolite_shortlist"]({"floor": 50})
    assert len(fake.calls) == 4  # nothing was kept between answers
    assert not hasattr(plugin, "_aa_cache") and "aa_cache_hours" not in plugin.DEFAULTS


def test_no_key_means_no_aa_request(setup, tmp_path):
    fake = FakeAA()
    out = _run(setup, fake, tmp_path, key="")
    assert fake.calls == [] and out["ok"] and "aa_display" not in out


def test_model_lookup_shows_aa_beside_the_catalog_row(setup, tmp_path):
    out = _run(setup, FakeAA(), tmp_path, tool="iolite_model", args={"query": "beta-fast"})
    assert out["matches"][0]["blended_price_per_M"] == 9
    assert out["aa_display"]["Beta Fast"]["tps"] == 300.0 and "attribution" in out


def test_key_never_appears_in_output(setup, tmp_path):
    ctx = setup(FakeAA(), _catalog(tmp_path))
    blob = ctx.tools["iolite_shortlist"]({}) + ctx.tools["iolite_model"]({"query": "alpha"})
    assert KEY not in blob


def test_nothing_is_written_to_disk(setup, tmp_path, monkeypatch):
    import builtins
    real_open, opened = builtins.open, []

    def spy(file, mode="r", *a, **k):
        if any(c in mode for c in "wax+"):
            opened.append(file)
        return real_open(file, mode, *a, **k)
    ctx = setup(FakeAA(), _catalog(tmp_path))
    monkeypatch.setattr(builtins, "open", spy)
    ctx.tools["iolite_shortlist"]({"floor": 50})
    ctx.tools["iolite_model"]({"query": "alpha"})
    assert opened == []


@pytest.mark.parametrize("code,needle", [(401, "rejected the key"), (429, "Retry after 3600s"),
                                         (500, "HTTP 500")])
def test_aa_errors_do_not_fail_the_ranking(setup, tmp_path, code, needle):
    headers = Message()
    headers["Retry-After"] = "3600"
    err = urllib.error.HTTPError(aa.FREE_URL, code, "x", headers, None)
    fake = FakeAA(error=err)
    out = _run(setup, fake, tmp_path)
    base = _run(setup, FakeAA(), tmp_path, key="")
    assert out["ok"] is True and needle in out["aa_display_error"] and KEY not in json.dumps(out)
    assert "Do not retry" in out["aa_display_error"] and "aa_display" not in out
    assert json.dumps(out["shortlist"]) == json.dumps(base["shortlist"])
    assert len(fake.calls) == 1  # one attempt, never a loop


def test_quota_message_names_the_daily_limit(setup, tmp_path):
    err = urllib.error.HTTPError(aa.FREE_URL, 429, "x", Message(), None)
    out = _run(setup, FakeAA(error=err), tmp_path)
    assert "100 requests a day" in out["aa_display_error"]


def test_paging_cap_is_an_error_not_a_silent_cut(setup, tmp_path):
    looping = [dict(PAGES[0])] * (aa.MAX_PAGES + 5)
    fake = FakeAA(pages=looping)
    out = _run(setup, fake, tmp_path)
    assert out["ok"] is True and "partial catalog" in out["aa_display_error"] and "aa_display" not in out
    assert len(fake.calls) == aa.MAX_PAGES == 20


def test_key_alone_is_not_a_catalog(setup):
    fake = FakeAA()
    out = json.loads(setup(fake).tools["iolite_shortlist"]({}))
    assert out["ok"] is False and "catalog_path" in out["error"] and "not a catalog" in out["error"]
    assert fake.calls == []


def test_blank_key_means_no_display(setup, tmp_path):
    fake = FakeAA()
    out = _run(setup, fake, tmp_path, key="   ")
    assert out["ok"] and fake.calls == [] and "aa_display" not in out
