"""Iolite for Hermes: pick a model by intelligence floor, then cost x speed.

Tools
  iolite_shortlist  floor (or anchor model) + objective -> Pareto shortlist with reasons
  iolite_model      look up one catalog row by name or slug
Slash command
  /iolite shortlist | model | status | help, the same answers from chat
Skill
  iolite:iolite walks the agent through floor, objective and the answer

Data source (no default; you choose it). First one set wins:
  catalog_path       a local JSON file: a list of rows or {"models": [...]}
  catalog_url        an Iolite /api/v1/models.json you are allowed to read, e.g. your
                     own private instance. Fetched with a plain GET, cached in memory.

Optional display (never a data source, never a ranking input):
  IOLITE_AA_API_KEY  your own free Artificial Analysis Data API key. When set, each
                     answer makes one fetch of the free language-models endpoint and
                     shows Artificial Analysis's numbers beside the models the
                     catalog already picked, labelled and credited. Nothing is cached
                     or written; ranking and sorting never read these values.

The plugin ships no catalog. Benchmark and price data carry their providers'
terms, so the operator points it at a source they may use. Every path returns
a JSON string and never raises into Hermes.
"""

from __future__ import annotations

import datetime
import json
import logging
import os
import stat
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from . import decide
except ImportError:  # loaded as a bare module (tests, validator)
    import importlib.util

    _spec = importlib.util.spec_from_file_location("iolite_decide", Path(__file__).with_name("decide.py"))
    decide = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(decide)
    _spec = importlib.util.spec_from_file_location("iolite_aa_source", Path(__file__).with_name("aa_source.py"))
    aa_source = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(aa_source)
else:
    from . import aa_source

logger = logging.getLogger(__name__)

PLUGIN_NAME = "iolite"
VERSION = "0.2.4"
DEFAULTS: Dict[str, Any] = {
    "catalog_url": "",
    "catalog_path": "",
    "cache_minutes": 60,
    "timeout_seconds": 15,
}
OBJECTIVES = {"min_cost": -1.0, "max_speed": 1.0, "balanced": None}
MAX_N = 25
MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 20_000  # far above any real catalog; bounds the work one bad file can cause

_ctx = None
_cache: Dict[str, Tuple[float, List[dict], str]] = {}
_aa_opener = None  # tests swap in a fake; None means urllib with same-origin redirects
_url_opener = None  # the same, for catalog_url
FAIL_TTL_SECONDS = 300  # a failed fetch is remembered this long, so retries can't drain a quota

SHORTLIST_SCHEMA = {
    "name": "iolite_shortlist",
    "description": (
        "Shortlist LLMs that clear an intelligence floor, then trade cost against speed. "
        "Models below the floor or missing price, speed or index are excluded; the rest are "
        "reduced to the cost x speed Pareto front and ranked by objective. Give floor (0-100, "
        "Artificial Analysis Intelligence Index scale) or anchor_model (use that model's index "
        "as the floor). objective: min_cost, max_speed or balanced (bias -1..1)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "floor": {"type": "number", "description": "Minimum intelligence index, 0-100. Default 50."},
            "anchor_model": {"type": "string", "description": "A model name or slug (case-insensitive); its index becomes the floor."},
            "objective": {"type": "string", "enum": sorted(OBJECTIVES),
                          "description": "min_cost, max_speed or balanced. Default balanced."},
            "bias": {"type": "number", "description": "balanced only: -1 cheaper ... +1 faster. Default 0."},
            "n": {"type": "integer", "description": f"Shortlist size, 1-{MAX_N}. Default 3."},
        },
    },
}

MODEL_SCHEMA = {
    "name": "iolite_model",
    "description": "Look up one model in the configured Iolite catalog by name or slug (case-insensitive; substring match if no exact hit).",
    "parameters": {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "A model name or slug, e.g. 'gpt-5' or 'Claude Opus 5.5'."}},
        "required": ["query"],
    },
}

_FIELDS = ("model", "provider", "openness", "reasoning", "context_length", "tps", "ttft",
           "blended_price_per_M", "aa_intelligence_index", "data_date")


def _settings_from_config() -> Dict[str, Any]:
    """plugins.entries.iolite.settings from config.yaml, used when no PluginContext is bound."""
    try:
        from hermes_cli.config import load_config

        entries = ((load_config() or {}).get("plugins") or {}).get("entries") or {}
        settings = (entries.get(PLUGIN_NAME) or {}).get("settings") or {}
        return settings if isinstance(settings, dict) else {}
    except Exception:
        return {}


def _cfg(key: str) -> Any:
    try:
        val = _ctx.get_config(key, None) if _ctx is not None else _settings_from_config().get(key)
    except Exception:
        val = None
    return DEFAULTS[key] if val is None else val


def _num_cfg(key: str) -> float:
    """A numeric setting; a non-number or negative value falls back to the default."""
    val = _cfg(key)
    try:
        num = float(val)
    except (TypeError, ValueError):
        return float(DEFAULTS[key])
    return num if num >= 0 and num == num and num != float("inf") else float(DEFAULTS[key])


def _timeout() -> float:
    return _num_cfg("timeout_seconds") or float(DEFAULTS["timeout_seconds"])


def _clamp_n(n: Any) -> int:
    """Shortlist size: an integer from 1 to MAX_N. Anything unusable means the default."""
    if isinstance(n, bool) or not isinstance(n, (int, float)) or n != n or n in (float("inf"), float("-inf")):
        return decide.DEFAULT_SHORTLIST_N
    return max(1, min(MAX_N, int(n)))


_NUMERIC = ("context_length", "tps", "ttft", "blended_price_per_M")


def _clean_row(r: dict) -> dict:
    """A copy of a catalog row whose numbers are all finite or None. A string,
    NaN, infinity or an index outside 0-100 reads as unknown, so one bad row is
    left out of scoring instead of crashing it or leaking NaN into the answer."""
    row = dict(r)
    for k in _NUMERIC:
        if k in row:
            row[k] = aa_source._num(row[k])
    if "aa_intelligence_index" in row:
        row["aa_intelligence_index"] = aa_source.index_or_none(row["aa_intelligence_index"])
    return row


def _rows(payload: Any) -> List[dict]:
    rows = payload.get("models") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ValueError("catalog must be a list of rows or an object with a 'models' list")
    if len(rows) > MAX_ROWS:
        raise ValueError(f"catalog has {len(rows)} rows; Iolite reads at most {MAX_ROWS}")
    return [_clean_row(r) for r in rows if isinstance(r, dict) and isinstance(r.get("model"), str)]


def _aa_key() -> str:
    """The operator's key, read through Hermes's secret scope so each profile on a
    multiplexing gateway gets its own. Plain os.environ only outside Hermes."""
    try:
        from agent.secret_scope import get_secret_str
    except ImportError:
        return (os.environ.get(aa_source.ENV_KEY) or "").strip()
    return (get_secret_str(aa_source.ENV_KEY) or "").strip()


_failures: Dict[str, Tuple[float, str]] = {}
_locks: Dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(cache_key: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(cache_key, threading.Lock())


def _cached_fetch(cache_key: str, ttl: float, fetch) -> Tuple[List[dict], str]:
    """Serve from cache; otherwise fetch once. A failure is remembered for
    FAIL_TTL_SECONDS and replayed, so an agent retrying a broken source spends
    no extra requests. Concurrent misses on one key wait for a single fetch."""

    def cached():
        now = time.monotonic()
        hit = _cache.get(cache_key)
        if hit and now - hit[0] < ttl:
            return hit[1], hit[2]
        failed = _failures.get(cache_key)
        if failed and now - failed[0] < FAIL_TTL_SECONDS:
            raise LookupError(failed[1])
        return None

    found = cached()
    if found:
        return found
    with _lock_for(cache_key):
        found = cached()  # another caller may have fetched while we waited
        if found:
            return found
        try:
            rows, label = fetch()
        except Exception as exc:
            _failures[cache_key] = (time.monotonic(), str(exc))
            raise
        _failures.pop(cache_key, None)
        _cache[cache_key] = (time.monotonic(), rows, label)
        return rows, label


def _redact_url(url: str) -> str:
    """scheme://host/path only: no user:password@, query string or fragment, which
    is where a private instance's token would sit."""
    u = urllib.parse.urlsplit(url)
    host = u.hostname or ""
    if u.port:
        host = f"{host}:{u.port}"
    return urllib.parse.urlunsplit((u.scheme, host, u.path, "", ""))


def _source_label(path: str = "", url: str = "") -> str:
    if path:
        return f"file:{Path(path).name}"
    return _redact_url(url)


def _read_catalog_file(path: str) -> bytes:
    """A regular file of at most MAX_BYTES. A FIFO, device or directory is refused
    before it is opened for reading, so it cannot hang the call."""
    p = Path(path).expanduser()
    try:
        st = p.stat()
    except OSError as exc:
        raise LookupError(f"catalog_path {p.name}: {exc.strerror or exc.__class__.__name__}") from None
    if not stat.S_ISREG(st.st_mode):
        raise ValueError(f"catalog_path {p.name} is not a regular file")
    if st.st_size > MAX_BYTES:
        raise ValueError("catalog file exceeds 8 MB")
    fd = os.open(p, os.O_RDONLY | getattr(os, "O_NONBLOCK", 0))
    with os.fdopen(fd, "rb") as fh:
        if not stat.S_ISREG(os.fstat(fh.fileno()).st_mode):  # swapped after the stat
            raise ValueError(f"catalog_path {p.name} is not a regular file")
        body = fh.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("catalog file exceeds 8 MB")
    return body


def load_catalog() -> Tuple[List[dict], str]:
    """Return (rows, source label). Raises LookupError when nothing is configured."""
    path = str(_cfg("catalog_path") or "").strip()
    url = str(_cfg("catalog_url") or "").strip()
    if path:
        try:
            payload = json.loads(_read_catalog_file(path))
        except UnicodeDecodeError:
            raise ValueError(f"catalog_path {Path(path).name} is not UTF-8 JSON") from None
        except json.JSONDecodeError:
            raise ValueError(f"catalog_path {Path(path).name} is not valid JSON") from None
        return _rows(payload), _source_label(path=path)
    if not url:
        raise LookupError(
            "No catalog configured. Under plugins.entries.iolite.settings, set catalog_path "
            "(a local JSON file) or catalog_url (an Iolite /api/v1/models.json you may use). "
            f"{aa_source.ENV_KEY} only adds Artificial Analysis numbers beside the picks; "
            "it is not a catalog."
        )
    if not url.lower().startswith(("https://", "http://")):
        raise ValueError("catalog_url must be http(s)")
    if "@" in urllib.parse.urlsplit(url).netloc:
        raise ValueError("catalog_url must not carry a user name or password; Iolite sends no credentials")
    label = _source_label(url=url)

    def fetch():
        req = urllib.request.Request(url, headers={"User-Agent": f"iolite-hermes/{VERSION}",
                                                   "Accept": "application/json"})
        opener = _url_opener or aa_source.open_same_origin
        timeout = _timeout()
        deadline = time.monotonic() + timeout
        try:
            with opener(req, timeout) as resp:
                body = aa_source.read_capped(resp, deadline, MAX_BYTES, f"catalog_url {label}")
        except urllib.error.HTTPError as exc:
            if 300 <= exc.code < 400:
                raise LookupError(f"catalog_url {label} redirected to another origin; refused") from None
            raise LookupError(f"catalog_url {label} returned HTTP {exc.code}") from None
        except TimeoutError:
            raise LookupError(f"catalog_url {label} did not answer within {timeout:g} s") from None
        except urllib.error.URLError as exc:
            reason = exc.reason if isinstance(exc.reason, str) else exc.reason.__class__.__name__
            raise LookupError(f"could not reach catalog_url {label}: {reason}") from None
        except OSError as exc:
            raise LookupError(f"could not reach catalog_url {label}: {exc.__class__.__name__}") from None
        if len(body) > MAX_BYTES:
            raise ValueError("catalog response exceeds 8 MB")
        try:
            payload = json.loads(body)
        except ValueError:
            raise ValueError(f"catalog_url {label} did not return JSON") from None
        return _rows(payload), label
    return _cached_fetch(url, _num_cfg("cache_minutes") * 60, fetch)


def _aa_display(models: List[dict]) -> dict:
    """Artificial Analysis numbers for models already chosen from the catalog.

    Display only: called after the ranking is final, never handed to decide.py,
    and its result is attached beside the picks, not merged into them. One fetch
    per call, no retry, no cache, nothing written. Returns {} without a key."""
    key = _aa_key()
    if not key or not models:
        return {}
    try:
        opener = _aa_opener or aa_source.open_same_origin
        found = aa_source.fetch_rows(key, datetime.date.today().isoformat(), _timeout(),
                                     f"iolite-hermes/{VERSION}", opener=opener)
    except Exception as exc:  # a failed display must not fail the answer
        msg = str(exc) if isinstance(exc, aa_source.AaError) else "Artificial Analysis request failed"
        return {"aa_display_error": msg + " The ranking above does not use Artificial Analysis. Do not retry in a loop."}
    by_slug = {str(r.get("slug", "")).casefold(): r for r in found if r.get("slug")}
    by_name = {str(r.get("model", "")).casefold(): r for r in found}
    shown: Dict[str, dict] = {}
    for m in models:
        name = str(m.get("model", ""))
        r = by_slug.get(str(m.get("slug", "")).casefold()) if m.get("slug") else None
        r = r or by_name.get(name.casefold())
        if r is None:
            continue
        shown[name] = {
            "label": "Artificial Analysis (display only, not used for ranking)",
            "intelligence_index": r.get("aa_intelligence_index"),
            "blended_price_per_M": r.get("blended_price_per_M"),
            "tps": r.get("tps"),
            "source_url": r.get("source_url"),
        }
    if not shown:
        return {"aa_display": {}, "aa_display_note": "No picked model was found in Artificial Analysis's list."}
    return {"aa_display": shown, "attribution": dict(aa_source.ATTRIBUTION)}


def _summary(m: dict) -> dict:
    return {k: m.get(k) for k in _FIELDS if k in m}


def _dumps(obj: Any) -> str:
    return json.dumps(obj, allow_nan=False)


def _err(msg: str) -> str:
    return _dumps({"ok": False, "error": msg})


def _resolve_anchor(rows: List[dict], anchor: str) -> Optional[str]:
    """The catalog's own spelling of `anchor`: exact first, then case-insensitive
    on name or slug, the same matching iolite_model uses."""
    if any(r.get("model") == anchor for r in rows):
        return anchor
    q = anchor.strip().casefold()
    for r in rows:
        if q in (str(r.get("model", "")).casefold(), str(r.get("slug", "")).casefold()):
            return r.get("model")
    return None


def iolite_shortlist(args: Optional[dict] = None, **_kw) -> str:
    if args is None:
        args = {}
    if not isinstance(args, dict):
        return _err("arguments must be an object")
    try:
        rows, source = load_catalog()
    except Exception as exc:  # never raise into Hermes
        return _err(str(exc))
    try:
        return _shortlist(rows, source, args)
    except Exception:  # one malformed catalog row must not become a traceback
        logger.debug("iolite: shortlist failed", exc_info=True)
        return _err("the catalog has a row Iolite cannot score; check its numbers")


def _shortlist(rows: List[dict], source: str, args: dict) -> str:
    objective = args.get("objective") or "balanced"
    if not isinstance(objective, str) or objective not in OBJECTIVES:
        return _err(f"objective must be one of {sorted(OBJECTIVES)}")
    fixed = OBJECTIVES[objective]
    bias = decide.clamp_bias(fixed if fixed is not None else args.get("bias", decide.DEFAULT_COST_SPEED_BIAS))

    anchor = args.get("anchor_model")
    if anchor is not None and not isinstance(anchor, str):
        return _err("anchor_model must be a model name")
    if anchor and anchor.strip():
        name = _resolve_anchor(rows, anchor)
        floor = decide.floor_from_anchor(rows, name) if name is not None else None
        if floor is None:
            return _err(f"anchor_model {anchor!r} not found or has no valid index")
        floor_source = "anchor"
    elif args.get("floor") is not None:
        floor, floor_source = decide.clamp_floor(args["floor"]), "user"
    else:
        floor, floor_source = decide.DEFAULT_INTELLIGENCE_FLOOR, "default"

    n = _clamp_n(args.get("n", decide.DEFAULT_SHORTLIST_N))
    out = decide.shortlist_from_decide(rows, floor, bias, n)
    reason = decide.bias_reason(bias)
    return _dumps({
        "ok": True,
        "schema_version": "1.0",
        "floor_applied": {"aa_intelligence_index": floor, "source": floor_source},
        "objective": objective,
        "cost_speed_bias": bias,
        "eligible_count": len(out["eligible"]),
        "pareto_count": len(out["pareto"]),
        "shortlist": [dict(rank=i + 1, reasons=["on_pareto", reason], **_summary(m))
                      for i, m in enumerate(out["shortlist"])],
        "refusals": [] if out["eligible"] else ["no_pick_eligible_models"],
        "catalog_snapshot_id": decide.catalog_snapshot_id(rows),
        "catalog_source": source,
        **_aa_display(out["shortlist"]),
    })


def iolite_model(args: Optional[dict] = None, **_kw) -> str:
    if args is not None and not isinstance(args, dict):
        return _err("arguments must be an object")
    q = str((args or {}).get("query") or "").strip().casefold()
    if not q:
        return _err("query is required")
    try:
        rows, source = load_catalog()
    except Exception as exc:
        return _err(str(exc))
    exact = [r for r in rows if q in (str(r.get("model", "")).casefold(), str(r.get("slug", "")).casefold())]
    hits = exact or [r for r in rows
                     if q in str(r.get("model", "")).casefold() or q in str(r.get("slug", "")).casefold()]
    return _dumps({"ok": True, "matches": [_summary(r) for r in hits[:10]],
                       "total_matches": len(hits), "catalog_source": source,
                       **_aa_display(hits[:10])})


_HELP = """/iolite picks a model by intelligence floor, then cost and speed.

  /iolite shortlist [floor|anchor model] [cheap|fast|balanced] [n=3]
      e.g. /iolite shortlist 60 cheap
           /iolite shortlist Claude Opus 5.5 fast n=5
      A lone number is the floor; any other words name the anchor model.
  /iolite model <name or slug>
  /iolite status     which catalog source is set, with no network call
  /iolite help"""

_OBJECTIVE_WORDS = {"cheap": "min_cost", "cheapest": "min_cost", "min_cost": "min_cost",
                    "fast": "max_speed", "fastest": "max_speed", "max_speed": "max_speed",
                    "balanced": "balanced"}


def _is_num(v: Any) -> bool:
    return aa_source._num(v) is not None


def _money(v: Any) -> str:
    """Dollars per million tokens. Under $1 keeps three significant figures, so
    $0.004/M doesn't print as $0.00/M."""
    if not _is_num(v):
        return "?"
    return f"${v:.3g}/M" if 0 < v < 1 else f"${v:,.2f}/M"


def _num(v: Any, unit: str) -> str:
    """Speeds under 10 keep one decimal, so 0.4 tok/s doesn't print as 0."""
    if not _is_num(v):
        return "?"
    return f"{v:,.1f} {unit}" if 0 < v < 10 else f"{v:,.0f} {unit}"


def _credit_line(res: dict) -> str:
    a = res.get("attribution")
    out = f"\n{a.get('text') or 'Source: Artificial Analysis (artificialanalysis.ai)'}" if isinstance(a, dict) else ""
    for k in ("aa_display_error", "aa_display_note"):
        if res.get(k):
            out += f"\nArtificial Analysis: {res[k]}"
    return out


def _aa_col(res: dict, model: Any) -> str:
    d = (res.get("aa_display") or {}).get(str(model))
    if not isinstance(d, dict):
        return ""
    idx = d.get("intelligence_index")
    return (f" | AA (display only): index {idx if idx is not None else '?'}, "
            f"{_money(d.get('blended_price_per_M'))}, {_num(d.get('tps'), 'tok/s')}")


def _parse_shortlist(rest: str) -> dict:
    import shlex

    try:
        words = shlex.split(rest)
    except ValueError as exc:
        raise ValueError(f"could not read the arguments: {exc}") from None
    args: Dict[str, Any] = {}
    rest_words: List[str] = []
    for w in words:
        low = w.casefold()
        if low in _OBJECTIVE_WORDS:
            args["objective"] = _OBJECTIVE_WORDS[low]
        elif low.startswith("n="):
            try:
                args["n"] = int(low[2:])
            except ValueError:
                raise ValueError(f"n must be a whole number, got {w[2:]!r}") from None
        elif low.startswith("bias="):
            try:
                args["bias"] = float(low[5:])
            except ValueError:
                raise ValueError(f"bias must be a number from -1 to 1, got {w[5:]!r}") from None
        else:
            rest_words.append(w)
    # One word that is a number is the floor. Anything else is a model name,
    # numbers included ("Claude Opus 5.5", "Synthetic Model 07").
    if len(rest_words) == 1:
        try:
            floor = float(rest_words[0])
        except ValueError:
            floor = None
        if floor is not None:
            if floor != floor or floor in (float("inf"), float("-inf")):
                raise ValueError(f"the floor must be a number from 0 to 100, got {rest_words[0]!r}")
            args["floor"] = floor
            return args
    if rest_words:
        args["anchor_model"] = " ".join(rest_words)
    return args


def _fmt_shortlist(res: dict) -> str:
    if not res.get("ok"):
        return f"Iolite: {res.get('error')}"
    fl = res["floor_applied"]
    head = (f"Floor {fl['aa_intelligence_index']:g} ({fl['source']}), {res['objective']}: "
            f"{res['eligible_count']} models clear it, {res['pareto_count']} on the cost x speed front.")
    if not res["shortlist"]:
        return (head + "\nNo model clears this floor with price, speed and index all known. "
                "Try a lower floor." + _credit_line(res))
    lines = [head]
    for m in res["shortlist"]:
        lines.append(f"{m['rank']}. {m.get('model')} ({m.get('provider') or '?'}): index "
                     f"{m.get('aa_intelligence_index')}, {_money(m.get('blended_price_per_M'))}, "
                     f"{_num(m.get('tps'), 'tok/s')}" + _aa_col(res, m.get("model")))
    return "\n".join(lines) + _credit_line(res)


def _fmt_model(res: dict) -> str:
    if not res.get("ok"):
        return f"Iolite: {res.get('error')}"
    if not res["matches"]:
        return "No model matches that name." + _credit_line(res)
    lines = [f"{m.get('model')} ({m.get('provider') or '?'}): index "
             f"{m.get('aa_intelligence_index') if m.get('aa_intelligence_index') is not None else '?'}, "
             f"{_money(m.get('blended_price_per_M'))}, {_num(m.get('tps'), 'tok/s')}, "
             f"context {_num(m.get('context_length'), 'tokens')}" + _aa_col(res, m.get("model"))
             for m in res["matches"]]
    more = res["total_matches"] - len(res["matches"])
    if more > 0:
        lines.append(f"…and {more} more. Use a longer name.")
    return "\n".join(lines) + _credit_line(res)


def _status() -> str:
    path = str(_cfg("catalog_path") or "").strip()
    url = str(_cfg("catalog_url") or "").strip()
    if path:
        src = f"catalog_path ({_source_label(path=path)})"
    elif url:
        src = f"catalog_url {_source_label(url=url)}"
    else:
        src = "none. Set catalog_path or catalog_url"
    aa = (f"{aa_source.ENV_KEY} is set: Artificial Analysis numbers are shown beside the picks (one fetch per answer, display only)"
          if _aa_key() else f"{aa_source.ENV_KEY} not set")
    return f"Iolite {VERSION}\nSource: {src}\nArtificial Analysis: {aa}"


def _slash(raw_args: str) -> str:
    parts = (raw_args or "").split(None, 1)
    cmd = parts[0].casefold() if parts else ""
    rest = parts[1].strip() if len(parts) > 1 else ""
    try:
        if cmd in ("", "help", "-h", "--help"):
            return _HELP
        if cmd == "status":
            return _status()
        if cmd == "model":
            import shlex

            try:
                query = " ".join(shlex.split(rest))
            except ValueError:
                query = rest  # an unmatched quote is part of the name
            if not query:
                return "Name a model: /iolite model <name or slug>"
            return _fmt_model(json.loads(iolite_model({"query": query})))
        if cmd == "shortlist":
            return _fmt_shortlist(json.loads(iolite_shortlist(_parse_shortlist(rest))))
    except ValueError as exc:
        return f"{exc}\n\n{_HELP}"
    except Exception:  # never raise into the chat surface
        logger.debug("iolite: slash command failed", exc_info=True)
        return "Iolite hit an unexpected error. Try /iolite status."
    return f"Unknown subcommand {cmd!r}.\n\n{_HELP}"


def _skill_description(skill_md: Path) -> str:
    """The description line from SKILL.md's frontmatter, for the skill list."""
    try:
        text = skill_md.read_text(encoding="utf-8")
    except OSError:
        return ""
    if not text.startswith("---"):
        return ""
    for line in text.split("---", 2)[1].splitlines():
        if line.startswith("description:"):
            return line.split(":", 1)[1].strip().strip("'\"")
    return ""


def register(ctx) -> None:
    global _ctx
    _ctx = ctx
    ctx.register_tool(name="iolite_shortlist", toolset="iolite", schema=SHORTLIST_SCHEMA,
                      handler=iolite_shortlist, description=SHORTLIST_SCHEMA["description"], emoji="🧭")
    ctx.register_tool(name="iolite_model", toolset="iolite", schema=MODEL_SCHEMA,
                      handler=iolite_model, description=MODEL_SCHEMA["description"], emoji="🧭")
    register_command = getattr(ctx, "register_command", None)
    if callable(register_command):
        try:
            register_command("iolite", handler=_slash,
                             description="Iolite: shortlist LLMs by intelligence floor, then cost and speed.",
                             args_hint="shortlist [floor|model] [cheap|fast|balanced] [n=3] | model <name> | status")
        except Exception:
            logger.debug("iolite: register_command failed", exc_info=True)
    register_skill = getattr(ctx, "register_skill", None)
    skill_md = Path(__file__).parent / "skills" / "iolite" / "SKILL.md"
    if callable(register_skill) and skill_md.exists():
        try:
            register_skill("iolite", skill_md, description=_skill_description(skill_md))
        except Exception:
            logger.debug("iolite: register_skill failed", exc_info=True)
