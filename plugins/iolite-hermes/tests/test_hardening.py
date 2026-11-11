"""Roast findings, each pinned: secret scope, redirects, quota, never-raise, parsing, redaction."""
import importlib.util
import io
import json
import sys
import types
import urllib.error
import urllib.request
from email.message import Message
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("iolite_plugin_hard", ROOT / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)
netio = plugin.netio

GOLDEN = json.loads((ROOT / "tests" / "fixtures" / "decide-golden.json").read_text())


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Ctx:
    def __init__(self, config=None):
        self.config, self.tools, self.commands = config or {}, {}, {}

    def get_config(self, key, default=None):
        return self.config.get(key, default)

    def register_tool(self, name, toolset, schema, handler, description="", emoji=""):
        self.tools[name] = handler

    def register_command(self, name, handler, description="", args_hint=""):
        self.commands[name] = handler


@pytest.fixture(autouse=True)
def clean():
    plugin._cache.clear()
    plugin._failures.clear()
    yield
    plugin._cache.clear()
    plugin._failures.clear()


def _ctx(config=None):
    c = Ctx(config)
    plugin.register(c)
    return c


def _catalog(tmp_path, rows):
    p = tmp_path / "models.json"
    p.write_text(json.dumps(rows))
    return str(p)


# Redirects never carry a catalog fetch to another origin.

CAT_URL = "https://cat.example/api/v2/x"


def _redirect(handler, from_url, to_url, headers=None):
    req = urllib.request.Request(from_url, headers=headers or {})
    return handler.redirect_request(req, None, 302, "Found", Message(), to_url)


@pytest.mark.parametrize("target", [
    "http://cat.example/api/v2/x",        # https -> http downgrade
    "https://other-host.example/x",                 # another host
    "https://cat.example.evil.example/x",  # look-alike host
    "ftp://cat.example/x",                # another scheme
    "https://cat.example:8443/x",         # another port
])
def test_cross_origin_redirect_is_refused_before_it_is_built(target):
    h = netio._SameOriginRedirect()
    with pytest.raises(urllib.error.HTTPError):
        _redirect(h, CAT_URL, target, {"x-test": "h"})


def test_same_origin_redirect_is_followed():
    h = netio._SameOriginRedirect()
    new = _redirect(h, CAT_URL + "?page=1", "/api/v2/language/models/free?page=1&v=2")
    assert new is not None and new.full_url.startswith("https://cat.example/")


def test_catalog_url_failure_is_remembered(monkeypatch):
    calls = []

    def opener(req, timeout):
        calls.append(1)
        raise urllib.error.URLError("connection refused")
    monkeypatch.setattr(plugin, "_url_opener", opener)
    c = _ctx({"catalog_url": "https://cat.example/api/v1/models.json"})
    for _ in range(3):
        out = json.loads(c.tools["iolite_shortlist"]({}))
        assert out["ok"] is False and "could not reach" in out["error"]
    assert len(calls) == 1


# catalog_url error paths and the 8 MB cap.

@pytest.mark.parametrize("make,needle", [
    (lambda r: urllib.error.HTTPError(r.full_url, 404, "x", Message(), None), "HTTP 404"),
    (lambda r: urllib.error.HTTPError(r.full_url, 302, "x", Message(), None), "another origin"),
    (lambda r: TimeoutError("timed out"), "did not answer within"),
    (lambda r: Resp(b"<html>not json"), "did not return JSON"),
    (lambda r: Resp(b"x" * (plugin.MAX_BYTES + 1)), "exceeds 8 MB"),
])
def test_catalog_url_errors_are_plain(monkeypatch, make, needle):
    def opener(req, timeout):
        res = make(req)
        if isinstance(res, BaseException):
            raise res
        return res
    monkeypatch.setattr(plugin, "_url_opener", opener)
    out = json.loads(_ctx({"catalog_url": "https://cat.example/m.json"}).tools["iolite_shortlist"]({}))
    assert out["ok"] is False and needle in out["error"]


# 5. Malformed arguments and extreme numbers return JSON errors, never raise.

@pytest.mark.parametrize("args", [["floor", 50], "floor=50", 7])
def test_non_dict_arguments(tmp_path, args):
    c = _ctx({"catalog_path": _catalog(tmp_path, GOLDEN["models"])})
    for tool in ("iolite_shortlist", "iolite_model"):
        assert json.loads(c.tools[tool](args))["ok"] is False


@pytest.mark.parametrize("bad", [{"objective": ["min_cost"]}, {"objective": {"x": 1}}, {"anchor_model": ["a"]},
                                 {"floor": "high"}, {"n": "lots"}, {"bias": "lean"}, {"floor": True}])
def test_odd_argument_types_are_clear_errors(tmp_path, bad):
    c = _ctx({"catalog_path": _catalog(tmp_path, GOLDEN["models"])})
    out = json.loads(c.tools["iolite_shortlist"](bad))
    assert out["ok"] is False
    key = next(iter(bad))
    assert key in out["error"] or key == "objective"


def test_one_huge_number_does_not_break_every_answer(tmp_path):
    rows = list(GOLDEN["models"]) + [{"model": "Huge", "tps": 1e308, "blended_price_per_M": 1e307,
                                      "aa_intelligence_index": 99}]
    c = _ctx({"catalog_path": _catalog(tmp_path, rows)})
    out = json.loads(c.tools["iolite_shortlist"]({"floor": 0}))
    base = json.loads(_ctx({"catalog_path": _catalog(tmp_path, GOLDEN["models"])}).tools["iolite_shortlist"]({"floor": 0}))
    assert out["ok"] is True and out["eligible_count"] == base["eligible_count"] + 1


# 6. Slash parsing: names with numbers, case-insensitive anchors, bad floors.

def test_unquoted_name_with_numbers_is_an_anchor():
    assert plugin._parse_shortlist("Claude Opus 5.5 fast n=5") == {
        "objective": "max_speed", "n": 5, "anchor_model": "Claude Opus 5.5"}
    assert plugin._parse_shortlist("Synthetic Model 07") == {"anchor_model": "Synthetic Model 07"}
    assert plugin._parse_shortlist("60 cheap") == {"floor": 60.0, "objective": "min_cost"}


@pytest.mark.parametrize("word", ["nan", "inf", "-inf"])
def test_non_finite_floor_is_refused(word):
    with pytest.raises(ValueError, match="floor must be a number"):
        plugin._parse_shortlist(word)


def test_anchor_matches_case_insensitively_and_by_slug(tmp_path):
    rows = [{"model": "Tie Alpha", "slug": "tie-alpha", "tps": 10, "blended_price_per_M": 1,
             "aa_intelligence_index": 61}]
    c = _ctx({"catalog_path": _catalog(tmp_path, rows)})
    for anchor in ("Tie Alpha", "TIE ALPHA", "tie-alpha"):
        out = json.loads(c.tools["iolite_shortlist"]({"anchor_model": anchor}))
        assert out["ok"] and out["floor_applied"] == {"aa_intelligence_index": 61.0, "source": "anchor"}


def test_slash_unquoted_anchor_end_to_end(tmp_path):
    rows = [{"model": "Synthetic Model 07", "tps": 10, "blended_price_per_M": 1, "aa_intelligence_index": 40}]
    c = _ctx({"catalog_path": _catalog(tmp_path, rows)})
    out = c.commands["iolite"]("shortlist synthetic model 07")
    assert out.startswith("Floor 40 (anchor)")


def test_model_without_index_prints_a_question_mark(tmp_path):
    c = _ctx({"catalog_path": _catalog(tmp_path, [{"model": "NoIdx", "provider": "P"}])})
    out = c.commands["iolite"]("model noidx")
    assert "index ?" in out and "None" not in out


# 7. Sources are named without tokens or home-directory paths.

def test_catalog_url_is_redacted_in_answers_and_status(monkeypatch):
    url = "https://cat.example:8443/api/v1/models.json?token=s3cret#frag"

    def opener(req, timeout):
        assert req.full_url == url  # the real URL is still what we fetch
        return Resp(json.dumps(GOLDEN["models"]).encode())
    monkeypatch.setattr(plugin, "_url_opener", opener)
    c = _ctx({"catalog_url": url})
    out = c.tools["iolite_shortlist"]({})
    status = c.commands["iolite"]("status")
    for text in (out, status):
        assert "s3cret" not in text and "#frag" not in text
    assert json.loads(out)["catalog_source"] == "https://cat.example:8443/api/v1/models.json"


def test_catalog_url_with_user_and_password_is_refused(monkeypatch):
    monkeypatch.setattr(plugin, "_url_opener", lambda *a: pytest.fail("must not fetch"))
    out = json.loads(_ctx({"catalog_url": "https://user:pw@cat.example/m.json"}).tools["iolite_shortlist"]({}))
    assert out["ok"] is False and "user name or password" in out["error"] and "pw" not in out["error"]


def test_catalog_path_shows_only_the_file_name(tmp_path):
    p = _catalog(tmp_path, GOLDEN["models"])
    c = _ctx({"catalog_path": p})
    out = json.loads(c.tools["iolite_shortlist"]({}))
    assert out["catalog_source"] == "file:models.json"
    assert str(tmp_path) not in c.commands["iolite"]("status")
