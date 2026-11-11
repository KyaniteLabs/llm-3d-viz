"""Behaviour tests for the two independent roasts: redaction on every error path,
the never-raise contract, argument parsing, identity, provenance, deadlines,
empty results, the synthetic demo, and the removal of any Artificial Analysis fetch."""

from __future__ import annotations

import http.client
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error

import pytest

from test_hardening import GOLDEN, Resp, ROOT, _catalog, _ctx, plugin  # noqa: F401
from test_hardening import clean  # noqa: F401  (autouse fixture)

netio = plugin.netio
ROW = {"tps": 10, "blended_price_per_M": 1, "intelligence": 60}


def _row(model, **kw):
    return dict(ROW, model=model, **kw)


def _tool(tmp_path, rows, tool="iolite_shortlist", args=None, **cfg):
    c = _ctx(dict(catalog_path=_catalog(tmp_path, rows), **cfg))
    return json.loads(c.tools[tool](args if args is not None else {}))


# 1. Redaction on every error path

@pytest.mark.parametrize("url", ["https://cat.example/m.json?token=SEKRET123 abc",
                                 "https://cat.example/m.json?token=SEKRET123\tabc",
                                 "https://cat.example/m.json?token=SEKRET123\x00",
                                 "https://cat.example:notaport/m.json?token=SEKRET123"])
def test_bad_catalog_url_never_echoes_the_token(monkeypatch, url):
    monkeypatch.setattr(plugin, "_url_opener", lambda *a: pytest.fail("must not fetch"))
    c = _ctx({"catalog_url": url})
    for text in (c.tools["iolite_shortlist"]({}), c.tools["iolite_model"]({"query": "x"}),
                 c.commands.get("iolite", plugin._slash)("status"), plugin._slash("shortlist")):
        assert "SEKRET123" not in text
    assert "SEKRET123" not in json.dumps(plugin._failures)
    assert json.loads(c.tools["iolite_shortlist"]({}))["ok"] is False


@pytest.mark.parametrize("exc", [http.client.InvalidURL("URL can't contain control characters. '/m?token=SEKRET123'"),
                                 ValueError("bad /m?token=SEKRET123"), RuntimeError("/m?token=SEKRET123")])
def test_library_errors_are_replaced_by_constructed_messages(monkeypatch, exc):
    def opener(req, timeout):
        raise exc
    monkeypatch.setattr(plugin, "_url_opener", opener)
    c = _ctx({"catalog_url": "https://cat.example/m.json?token=SEKRET123"})
    out = c.tools["iolite_shortlist"]({})
    again = c.tools["iolite_shortlist"]({})  # served from the failure memo
    assert "SEKRET123" not in out + again + json.dumps(plugin._failures)
    assert json.loads(out)["ok"] is False


def test_plain_http_needs_an_explicit_opt_in(monkeypatch):
    seen = []

    def opener(req, timeout):
        seen.append(req.full_url)
        return Resp(json.dumps(GOLDEN["catalogs"]["mixed"]).encode())
    monkeypatch.setattr(plugin, "_url_opener", opener)
    out = json.loads(_ctx({"catalog_url": "http://cat.example/m.json"}).tools["iolite_shortlist"]({}))
    assert out["ok"] is False and "https" in out["error"] and not seen
    plugin._failures.clear()
    ok = json.loads(_ctx({"catalog_url": "http://cat.example/m.json", "allow_http": True}).tools["iolite_shortlist"]({}))
    assert ok["ok"] is True and seen == ["http://cat.example/m.json"]


def test_permission_error_does_not_reveal_the_full_path(monkeypatch, tmp_path):
    p = tmp_path / "private-dir" / "models.json"
    p.parent.mkdir()
    p.write_text("[]")

    def deny(path, *a, **k):
        raise PermissionError(13, "Permission denied", str(path))
    monkeypatch.setattr(plugin.os, "open", deny)
    out = _ctx({"catalog_path": str(p)}).tools["iolite_shortlist"]({})
    assert "private-dir" not in out and str(tmp_path) not in out
    assert "models.json" in out and json.loads(out)["ok"] is False


# 3. Never raise; every field is safe to print

def test_a_nan_provider_does_not_break_iolite_model(tmp_path):
    p = tmp_path / "m.json"
    p.write_text('[{"model": "x", "provider": NaN, "reasoning": NaN, "tps": 1, "blended_price_per_M": 1, '
                 '"intelligence": 60}]')
    c = _ctx({"catalog_path": str(p)})
    for tool, args in (("iolite_model", {"query": "x"}), ("iolite_shortlist", {"floor": 0})):
        out = c.tools[tool](args)
        assert "NaN" not in out and json.loads(out)["ok"] is True


def test_a_huge_json_integer_does_not_poison_the_catalog(tmp_path):
    p = tmp_path / "m.json"
    p.write_text('[{"model": "Big", "tps": 1%s, "blended_price_per_M": 1, "intelligence": 60},'
                 ' {"model": "Ok", "tps": 5, "blended_price_per_M": 1, "intelligence": 60}]' % ("0" * 400))
    out = json.loads(_ctx({"catalog_path": str(p)}).tools["iolite_shortlist"]({"floor": 0}))
    assert out["ok"] is True and sorted(m["model"] for m in out["shortlist"]) == ["Big", "Ok"]
    big = next(m for m in out["shortlist"] if m["model"] == "Big")
    assert big["tps"] is None  # the absurd number is dropped, the row is kept


@pytest.mark.parametrize("name,arg", [("floor", 10 ** 400), ("bias", 10 ** 400), ("n", 10 ** 400)])
def test_huge_integer_arguments_name_the_argument(tmp_path, name, arg):
    out = _tool(tmp_path, [_row("A")], args={name: arg})
    assert out["ok"] is False and name in out["error"]


def test_every_handler_survives_a_failing_catalog_loader(monkeypatch):
    def boom():
        raise RuntimeError("/home/x/secret?token=SEKRET123")
    monkeypatch.setattr(plugin, "load_catalog", boom)
    c = _ctx({})
    for out in (c.tools["iolite_shortlist"]({}), c.tools["iolite_model"]({"query": "x"})):
        assert json.loads(out)["ok"] is False and "SEKRET123" not in out
    for sub in ("shortlist", "model x", "status", "help", "", "nope"):
        assert isinstance(c.commands["iolite"](sub), str)
    assert json.loads(c.tools["iolite_model"]({"query": 5}))["ok"] is False


def test_row_text_cannot_forge_chat_output(tmp_path):
    evil = "Nice\n@everyone <https://evil.example|click> <!channel> `x` \x1b[31m" + "z" * 500
    rows = [_row(evil, provider="@here\r\nSecond line", slug="s")]
    c = _ctx({"catalog_path": _catalog(tmp_path, rows)})
    res = json.loads(c.tools["iolite_shortlist"]({"floor": 0}))
    m = res["shortlist"][0]
    assert len(m["model"]) <= 200 and "\n" not in m["model"] + m["provider"]
    assert "\x1b" not in m["model"] and "<" not in m["model"] and "`" not in m["model"]
    assert "@everyone" not in m["model"] and "@here" not in m["provider"]
    text = c.commands["iolite"]("shortlist 0")
    assert "@everyone" not in text and "<https" not in text and "<!channel>" not in text
    assert len(text.splitlines()) == 2  # header and one pick


# 4. Argument parsing

def test_numeric_strings_are_coerced(tmp_path):
    rows = [_row("A", intelligence=55), _row("B", intelligence=65, tps=20, blended_price_per_M=2)]
    out = _tool(tmp_path, rows, args={"floor": "60", "n": "1", "bias": "0.5"})
    assert out["floor_applied"] == {"intelligence": 60.0, "source": "user"}
    assert out["cost_speed_bias"] == 0.5 and [m["model"] for m in out["shortlist"]] == ["B"]


@pytest.mark.parametrize("args,name", [({"floor": "sixty"}, "floor"), ({"floor": "nan"}, "floor"),
                                       ({"n": "1_0"}, "n"), ({"bias": "1e999"}, "bias"), ({"n": True}, "n")])
def test_unusable_numbers_are_clear_errors(tmp_path, args, name):
    out = _tool(tmp_path, [_row("A")], args=args)
    assert out["ok"] is False and name in out["error"]


def test_only_the_last_unquoted_word_is_an_objective():
    assert plugin._parse_shortlist("Fast Model 3 cheap") == {"anchor_model": "Fast Model 3", "objective": "min_cost"}
    assert plugin._parse_shortlist("cheap model 3") == {"anchor_model": "cheap model 3"}
    assert plugin._parse_shortlist('"Grok 4 Fast"') == {"anchor_model": "Grok 4 Fast"}
    assert plugin._parse_shortlist('"Grok 4 Fast" cheap') == {"anchor_model": "Grok 4 Fast", "objective": "min_cost"}


def test_slash_keeps_a_model_name_that_ends_in_an_objective_word(tmp_path):
    rows = [_row("Grok 4 Fast", intelligence=61), _row("Grok 4", intelligence=30)]
    c = _ctx({"catalog_path": _catalog(tmp_path, rows)})
    assert c.commands["iolite"]("shortlist Grok 4 Fast").startswith("Floor 61 (anchor), balanced")


# 5. Dominance at full precision

def test_min_cost_returns_the_cheapest_model(tmp_path):
    rows = [_row("Cheapest", blended_price_per_M=0.001, tps=1), _row("Dearer", blended_price_per_M=0.0049, tps=2)]
    out = _tool(tmp_path, rows, args={"floor": 0, "objective": "min_cost"})
    assert [m["model"] for m in out["shortlist"]][0] == "Cheapest" and out["pareto_count"] == 2


# 6. Anchor identity

def test_anchor_slug_picks_the_row_it_names(tmp_path):
    rows = [_row("Twin", slug="twin-a", intelligence=40), _row("Twin", slug="twin-b", intelligence=80)]
    out = _tool(tmp_path, rows, args={"anchor_model": "twin-b"})
    assert out["floor_applied"]["intelligence"] == 80.0 and out["anchor"]["slug"] == "twin-b"


def test_an_ambiguous_anchor_name_is_refused(tmp_path):
    rows = [_row("Twin", slug="twin-a", intelligence=40), _row("Twin", slug="twin-b", intelligence=80)]
    out = _tool(tmp_path, rows, args={"anchor_model": "Twin"})
    assert out["ok"] is False and "2 rows" in out["error"] and "twin-a" in out["error"]


# 8. Deadlines on slow reads

def test_a_buffered_drip_is_cut_off_at_the_deadline():
    a, b = socket.socketpair()
    stop = threading.Event()

    def drip():
        a.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 100000\r\n\r\n")
        while not stop.is_set():
            try:
                a.sendall(b" ")
            except OSError:
                return
            time.sleep(0.05)
    t = threading.Thread(target=drip, daemon=True)
    t.start()
    resp = http.client.HTTPResponse(b)
    resp.begin()
    t0 = time.monotonic()
    with pytest.raises(TimeoutError):
        netio.read_capped(resp, time.monotonic() + 0.3, 1_000_000, "catalog")
    stop.set()
    a.close()
    b.close()
    assert time.monotonic() - t0 < 1.5


def test_a_silent_server_is_cut_off_at_the_deadline():
    a, b = socket.socketpair()
    a.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabc")
    resp = http.client.HTTPResponse(b)
    resp.begin()
    t0 = time.monotonic()
    with pytest.raises(TimeoutError):
        netio.read_capped(resp, time.monotonic() + 0.3, 1_000_000, "catalog")
    a.close()
    b.close()
    assert time.monotonic() - t0 < 1.5


# 9. Provenance

def test_rows_naming_artificial_analysis_are_refused_from_a_file(tmp_path):
    rows = [_row("Kept", license="MIT", attribution="Invented Co, CC0"),
            _row("Bad", source="Artificial Analysis"), _row("Bad2", provenance={"from": "artificialanalysis.ai"}),
            _row("Bad3", source_url="https://artificialanalysis.ai/models/x")]
    out = _tool(tmp_path, rows, args={"floor": 0, "n": 10})
    assert [m["model"] for m in out["shortlist"]] == ["Kept"] and out["rows_refused_for_provenance"] == 3
    kept = out["shortlist"][0]
    assert kept["license"] == "MIT" and kept["attribution"] == "Invented Co, CC0"
    assert "refused" in plugin._slash.__globals__["_fmt_shortlist"](out)


def test_rows_naming_artificial_analysis_are_refused_from_a_url(monkeypatch):
    body = json.dumps([_row("Kept"), _row("Bad", source="Artificial Analysis Data API (free tier)")]).encode()
    monkeypatch.setattr(plugin, "_url_opener", lambda req, t: Resp(body))
    out = json.loads(_ctx({"catalog_url": "https://cat.example/m.json"}).tools["iolite_model"]({"query": "b"}))
    assert out["matches"] == [] and out["rows_refused_for_provenance"] == 1


def test_a_catalog_that_names_artificial_analysis_as_its_source_is_refused(tmp_path):
    p = tmp_path / "m.json"
    p.write_text(json.dumps({"source": "Artificial Analysis", "models": [_row("A")]}))
    out = json.loads(_ctx({"catalog_path": str(p)}).tools["iolite_shortlist"]({}))
    assert out["ok"] is False and "Artificial Analysis" in out["error"]


# 10. Empty results

def test_empty_result_says_whether_data_is_missing_or_below_the_floor(tmp_path):
    missing = _tool(tmp_path, [{"model": "A", "intelligence": 90}], args={"floor": 0})
    assert missing["refusals"] == ["no_scorable_models"] and missing["scorable_count"] == 0
    text = plugin._fmt_shortlist(missing)
    assert "no floor can help" in text and "lower floor" not in text
    below = _tool(tmp_path, [_row("A", intelligence=40)], args={"floor": 80})
    assert below["refusals"] == ["no_pick_eligible_models"] and below["max_scorable_intelligence"] == 40
    assert "Try a floor at or below 40" in plugin._fmt_shortlist(below)


def test_the_skill_does_not_tell_people_to_lower_the_floor_for_missing_data():
    text = (ROOT / "skills" / "iolite" / "SKILL.md").read_text()
    assert "scorable_count" in text and "no_scorable_models" in text


# No Artificial Analysis fetch path exists

def test_no_artificial_analysis_fetch_path_exists(monkeypatch, tmp_path):
    assert not (ROOT / "aa_source.py").exists() and not hasattr(plugin, "aa_source")
    assert not hasattr(plugin, "_aa_display") and not hasattr(plugin, "_aa_key")
    for f in ROOT.glob("*.py"):
        src = f.read_text().lower()
        assert "x-api-key" not in src and "artificialanalysis.ai/api" not in src and "iolite_aa_api_key" not in src
    assert "IOLITE_AA_API_KEY" not in (ROOT / "plugin.yaml").read_text()
    monkeypatch.setenv("IOLITE_AA_API_KEY", "synthetic-key")
    monkeypatch.setattr(plugin.urllib.request, "urlopen", lambda *a, **k: pytest.fail("network"))
    monkeypatch.setattr(netio, "open_same_origin", lambda *a, **k: pytest.fail("network"))
    out = _tool(tmp_path, [_row("A")], args={"floor": 0})
    assert out["ok"] is True and not any(k.startswith("aa_") and k != "intelligence" for k in out)
    assert "attribution" not in out


# Demo script

def test_the_demo_script_prints_the_readme_sample():
    out = subprocess.run([sys.executable, str(ROOT / "demo" / "try_it.py"), "shortlist"],
                         capture_output=True, text=True, timeout=30, check=True).stdout
    assert out in (ROOT / "README.md").read_text()
