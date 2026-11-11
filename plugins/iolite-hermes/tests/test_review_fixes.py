"""Regression tests for the v0.2.2 review: key handling, file and URL limits,
cache keys, row cleaning, JS parity in decide.py and the slash command."""

from __future__ import annotations

import json
import math
import os
import random
import shutil
import subprocess
import threading
import time

import pytest

from test_hardening import GOLDEN, KEY, Resp, _catalog, _ctx, aa, plugin  # noqa: F401
from test_hardening import clean  # noqa: F401  (autouse fixture)

decide = plugin.decide


# Keys, caching and concurrency

def test_key_with_a_newline_is_refused_without_echoing_it(monkeypatch, tmp_path):
    p = tmp_path / "m.json"
    p.write_text(json.dumps([{"model": "M", "tps": 1, "blended_price_per_M": 1, "aa_intelligence_index": 90}]))
    monkeypatch.setattr(plugin, "_aa_key", lambda: "abc\nsecretpart")
    monkeypatch.setattr(plugin, "_aa_opener", lambda *a: pytest.fail("must not fetch"))
    out = json.loads(_ctx({"catalog_path": str(p)}).tools["iolite_shortlist"]({}))
    assert out["ok"] is True and "paste the key again" in out["aa_display_error"]
    assert "secretpart" not in json.dumps(out)


def test_concurrent_misses_fetch_once():
    calls, gate = [], threading.Event()

    def fetch():
        calls.append(1)
        gate.wait(2)
        return [], "x"

    out = []
    threads = [threading.Thread(target=lambda: out.append(plugin._cached_fetch("k", 60, fetch)))
               for _ in range(8)]
    for t in threads:
        t.start()
    time.sleep(0.05)
    gate.set()
    for t in threads:
        t.join(3)
    assert len(calls) == 1 and len(out) == 8


# catalog_path and catalog_url limits

@pytest.mark.skipif(not hasattr(os, "mkfifo"), reason="needs FIFOs")
def test_a_fifo_catalog_path_is_refused_without_hanging(tmp_path):
    fifo = tmp_path / "pipe.json"
    os.mkfifo(fifo)
    t0 = time.monotonic()
    out = json.loads(_ctx({"catalog_path": str(fifo)}).tools["iolite_shortlist"]({}))
    assert out["ok"] is False and "not a regular file" in out["error"]
    assert time.monotonic() - t0 < 2


def test_directory_missing_and_oversized_catalog_paths(tmp_path):
    big = tmp_path / "big.json"
    big.write_bytes(b" " * (plugin.MAX_BYTES + 1))
    for path, needle in ((tmp_path, "not a regular file"), (tmp_path / "nope.json", "nope.json"),
                         (big, "exceeds 8 MB")):
        out = json.loads(_ctx({"catalog_path": str(path)}).tools["iolite_shortlist"]({}))
        assert out["ok"] is False and needle in out["error"]
        assert str(tmp_path) not in out["error"]


def test_too_many_rows_are_refused(tmp_path, monkeypatch):
    monkeypatch.setattr(plugin, "MAX_ROWS", 3)
    out = json.loads(_ctx({"catalog_path": _catalog(tmp_path, GOLDEN["models"][:4])}).tools["iolite_shortlist"]({}))
    assert out["ok"] is False and "at most 3" in out["error"]


def test_a_slow_drip_catalog_url_hits_the_deadline(monkeypatch):
    class Drip(Resp):
        def read(self, n=-1):
            time.sleep(0.15)
            return b" "

    monkeypatch.setattr(plugin, "_url_opener", lambda req, timeout: Drip())
    t0 = time.monotonic()
    out = json.loads(_ctx({"catalog_url": "https://cat.example/m.json", "timeout_seconds": 0.4})
                     .tools["iolite_shortlist"]({}))
    assert out["ok"] is False and "did not answer within" in out["error"]
    assert time.monotonic() - t0 < 2


# Row cleaning: no crash, no NaN, index kept to 0-100

BAD_ROWS = [
    {"model": "Str", "tps": "fast", "blended_price_per_M": "1", "aa_intelligence_index": "70"},
    {"model": "Nan", "tps": float("nan"), "blended_price_per_M": 1.0, "aa_intelligence_index": 70},
    {"model": "Inf", "tps": 100.0, "blended_price_per_M": float("inf"), "aa_intelligence_index": 70},
    {"model": "Over", "tps": 100.0, "blended_price_per_M": 1.0, "aa_intelligence_index": 150},
    {"model": "Bool", "tps": True, "blended_price_per_M": 1.0, "aa_intelligence_index": 70},
]


def test_malformed_rows_are_unknown_not_fatal(tmp_path):
    p = tmp_path / "m.json"
    p.write_text(json.dumps(list(GOLDEN["models"]) + BAD_ROWS))  # json allows NaN/Infinity
    c = _ctx({"catalog_path": str(p)})
    out = c.tools["iolite_shortlist"]({"floor": 0, "n": 25})
    assert "NaN" not in out and "Infinity" not in out
    res = json.loads(out)
    assert res["ok"] is True
    assert not {m["model"] for m in res["shortlist"]} & {r["model"] for r in BAD_ROWS}
    over = json.loads(c.tools["iolite_model"]({"query": "Over"}))["matches"][0]
    assert over["aa_intelligence_index"] is None
    nan = json.loads(c.tools["iolite_model"]({"query": "nan"}))["matches"][0]
    assert nan["tps"] is None


def test_anchor_with_an_out_of_range_index_is_refused(tmp_path):
    c = _ctx({"catalog_path": _catalog(tmp_path, list(GOLDEN["models"]) + BAD_ROWS[3:4])})
    out = json.loads(c.tools["iolite_shortlist"]({"anchor_model": "Over"}))
    assert out["ok"] is False and "no valid index" in out["error"]


# decide.py parity with the TypeScript

def _pairwise(models):
    valid = [m for m in models if decide.is_scorable(m)]
    return [c for c in valid if not any(o is not c and decide.dominates_cost_speed(o, c) for o in valid)]


@pytest.mark.parametrize("seed", range(40))
def test_pareto_sweep_matches_the_pairwise_definition(seed):
    rnd = random.Random(seed)
    rows = [{"model": f"m{i}", "tps": rnd.choice([rnd.uniform(0, 300), rnd.choice([10, 10.04, 50, 120])]),
             "blended_price_per_M": rnd.choice([rnd.uniform(0, 30), rnd.choice([0, 1, 1.004, 2.5])]),
             "aa_intelligence_index": rnd.uniform(0, 100)} for i in range(rnd.randint(0, 120))]
    assert decide.cost_speed_pareto(rows) == _pairwise(rows)


def test_pareto_is_fast_on_a_big_catalog():
    rnd = random.Random(7)
    rows = [{"model": f"m{i}", "tps": rnd.uniform(1, 300), "blended_price_per_M": rnd.uniform(0, 30),
             "aa_intelligence_index": 60} for i in range(20_000)]
    t0 = time.monotonic()
    decide.cost_speed_pareto(rows)
    assert time.monotonic() - t0 < 2


@pytest.mark.parametrize("value,js", [
    (1e-6, "0.000001"), (1e-7, "1e-7"), (1.23e22, "1.23e+22"), (1e21, "1e+21"),
    (1.5e-10, "1.5e-10"), (123456789012345680000.0, "123456789012345680000"),
    (0.1, "0.1"), (100, "100"), (2.5, "2.5"), (-0.000123, "-0.000123"), (1e300, "1e+300"),
    (5e-324, "5e-324"), (0.0, "0"), (-0.0, "0"), (999999999999999900000.0, "999999999999999900000"),
])
def test_js_number_strings(value, js):
    assert decide._js_num(value) == js


NODE = shutil.which("node")


@pytest.mark.skipif(not NODE, reason="node not installed")
def test_js_number_strings_match_node_on_random_values():
    rnd = random.Random(3)
    vals = [rnd.uniform(-1, 1) * 10 ** rnd.randint(-12, 25) for _ in range(300)]
    out = subprocess.run([NODE, "-e", "process.stdout.write(JSON.stringify(JSON.parse(require('fs')"
                          ".readFileSync(0,'utf8')).map(String)))"],
                         input=json.dumps(vals), capture_output=True, text=True, timeout=30, check=True)
    assert [decide._js_num(v) for v in vals] == json.loads(out.stdout)


def test_locale_order_matches_icu_on_known_names():
    names = ["AModel", "Ä-Model", "A-Model", "a-model", "A_Model", "A Model"]
    assert sorted(names, key=decide._locale_key) == ["A Model", "A_Model", "a-model", "A-Model", "Ä-Model", "AModel"]


@pytest.mark.skipif(not NODE, reason="node not installed")
def test_locale_order_matches_node_on_random_names():
    rnd = random.Random(11)
    alphabet = "aAbBzZ09 -_.()é"
    names = sorted({"".join(rnd.choice(alphabet) for _ in range(rnd.randint(1, 6))) for _ in range(400)})
    out = subprocess.run([NODE, "-e", "const a=JSON.parse(require('fs').readFileSync(0,'utf8'));"
                          "a.sort((x,y)=>x.localeCompare(y));process.stdout.write(JSON.stringify(a))"],
                         input=json.dumps(names), capture_output=True, text=True, timeout=30, check=True)
    ours = sorted(names, key=decide._locale_key)
    js = json.loads(out.stdout)
    # Strings ICU calls equal keep their input order in both sorts, so compare keys.
    assert [decide._locale_key(n) for n in ours] == [decide._locale_key(n) for n in js]


# Slash command and formatting

def test_empty_results_still_credit_artificial_analysis():
    res = {"ok": True, "floor_applied": {"aa_intelligence_index": 99, "source": "user"},
           "objective": "balanced", "eligible_count": 0, "pareto_count": 0, "shortlist": [],
           "attribution": dict(aa.ATTRIBUTION)}
    assert "Artificial Analysis" in plugin._fmt_shortlist(res)
    assert "Artificial Analysis" in plugin._fmt_model({"ok": True, "matches": [], "total_matches": 0,
                                                       "attribution": dict(aa.ATTRIBUTION)})


def test_slash_splits_on_any_whitespace_and_unquotes_model_names(tmp_path):
    c = _ctx({"catalog_path": _catalog(tmp_path, GOLDEN["models"])})
    name = GOLDEN["models"][0]["model"]
    plain = c.commands["iolite"](f"model {name}")
    assert c.commands["iolite"](f"model\t{name}") == plain
    assert c.commands["iolite"](f'model "{name}"') == plain
    assert c.commands["iolite"]("status\n").startswith("Iolite ")


def test_substring_search_covers_slugs(tmp_path):
    rows = [{"model": "Readable Name", "slug": "vendor-xyz-large-2", "tps": 50, "blended_price_per_M": 1,
             "aa_intelligence_index": 60}]
    out = json.loads(_ctx({"catalog_path": _catalog(tmp_path, rows)}).tools["iolite_model"]({"query": "xyz-large"}))
    assert [m["model"] for m in out["matches"]] == ["Readable Name"]


@pytest.mark.parametrize("v,text", [(0.004, "$0.004/M"), (0.15, "$0.15/M"), (3.5, "$3.50/M"),
                                    (1234.5, "$1,234.50/M"), (0, "$0.00/M"), ("x", "?"), (True, "?")])
def test_money(v, text):
    assert plugin._money(v) == text


@pytest.mark.parametrize("v,text", [(0.4, "0.4 tok/s"), (9.95, "9.9 tok/s"), (12.6, "13 tok/s"),
                                    (1500, "1,500 tok/s"), (float("nan"), "?")])
def test_speed(v, text):
    assert plugin._num(v, "tok/s") == text


def test_skill_is_registered_with_its_description():
    got = {}

    class SkillCtx(type(_ctx())):
        def register_skill(self, name, path, description="", frontmatter=None):
            got.update(name=name, description=description)

    plugin.register(SkillCtx())
    assert got["name"] == "iolite" and got["description"].startswith("Pick an LLM")
