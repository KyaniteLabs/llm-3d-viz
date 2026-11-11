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
  catalog_url        an https URL of an Iolite /api/v1/models.json you are allowed to read,
                     e.g. your own private instance. Fetched with a plain GET, cached in
                     memory. Plain http needs allow_http: true.

The plugin ships no catalog and fetches nothing else. Rows whose source or
provenance names Artificial Analysis are refused. Every public path returns a
JSON string (or, for the slash command, text) and never raises into Hermes.
"""

from __future__ import annotations

import http.client
import hashlib
import json
import logging
import os
import re
import shlex
import stat
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from . import decide, netio
except ImportError:  # loaded as a bare module (tests, validator)
    import importlib.util

    def _load(name: str, file: str):
        spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    decide = _load("iolite_decide", "decide.py")
    netio = _load("iolite_netio", "netio.py")

logger = logging.getLogger(__name__)

PLUGIN_NAME = "iolite"
VERSION = "0.2.4"
DEFAULTS: Dict[str, Any] = {
    "catalog_url": "",
    "catalog_path": "",
    "allow_http": False,
    "cache_minutes": 60,
    "timeout_seconds": 15,
}
OBJECTIVES = {"min_cost": -1.0, "max_speed": 1.0, "balanced": None}
MAX_N = 25
MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 20_000  # far above any real catalog; bounds the work one bad file can cause
MAX_TEXT = 200

_ctx = None
_cache: Dict[str, Tuple[float, List[dict], str]] = {}
_url_opener = None  # tests swap in a fake; None means urllib with same-origin redirects
FAIL_TTL_SECONDS = 300  # a failed fetch is remembered this long, so retries can't hammer a source


class CatalogError(LookupError, ValueError):
    """A catalog problem with a message Iolite built itself: no URL query, no full
    path, nothing a server or the OS wrote. Only these are shown or remembered."""


class ArgError(ValueError):
    """A tool or slash argument the caller can fix; the message names it."""


SHORTLIST_SCHEMA = {
    "name": "iolite_shortlist",
    "description": (
        "Shortlist LLMs that clear an intelligence floor, then trade cost against speed. "
        "Models below the floor or missing price, speed or index are excluded; the rest are "
        "reduced to the cost x speed Pareto front and ranked by objective. Give floor (0-100, "
        "an intelligence score on a 0-100 scale; the source is up to the catalog) or anchor_model "
        "(use that model's score as the floor). objective: min_cost, max_speed or balanced (bias -1..1)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "floor": {"type": "number", "description": "Minimum intelligence score, 0-100 (a number or numeric string). Default 50."},
            "anchor_model": {"type": "string", "description": "A model name or slug (case-insensitive); its score becomes the floor; an ambiguous name is refused, so use the slug."},
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


_FIELDS = ("model", "slug", "provider", "openness", "reasoning", "context_length", "tps", "ttft",
           "blended_price_per_M", "aa_intelligence_index", "data_date",
           "source", "source_url", "license", "attribution")
_TEXT_FIELDS = ("model", "slug", "provider", "openness", "data_date", "source", "license", "attribution")
_NUMERIC = ("context_length", "tps", "ttft", "blended_price_per_M")
_PROVENANCE_KEYS = ("source", "sources", "source_url", "provenance", "attribution", "data_source",
                    "license", "licence", "origin", "citation")


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
    except (TypeError, ValueError, OverflowError):
        return float(DEFAULTS[key])
    return num if num >= 0 and num == num and num != float("inf") else float(DEFAULTS[key])


def _timeout() -> float:
    return _num_cfg("timeout_seconds") or float(DEFAULTS["timeout_seconds"])


def _allow_http() -> bool:
    v = _cfg("allow_http")
    return v is True or (isinstance(v, str) and v.strip().casefold() in ("true", "yes", "1"))


_NUM_RE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


def _arg_number(args: dict, name: str) -> Optional[float]:
    """A numeric argument given as a number or a numeric string. Absent is None;
    anything unusable is an ArgError that names the argument."""
    v = args.get(name)
    if v is None:
        return None
    if isinstance(v, str):
        text = v.strip()
        if not _NUM_RE.match(text) or len(text) > 40:
            raise ArgError(f"{name} must be a number, got {_safe_text(v, 40)!r}")
        try:
            v = float(text)
        except OverflowError:
            raise ArgError(f"{name} is too large; give a finite number") from None
    elif isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ArgError(f"{name} must be a number")
    f = netio._num(v)
    if f is None:
        raise ArgError(f"{name} is too large or not finite; give a finite number")
    return f


def _clamp_n(n: Any) -> int:
    """Shortlist size: an integer from 1 to MAX_N. A numeric string counts; anything
    else unusable means the default."""
    if isinstance(n, str) and _NUM_RE.match(n.strip()) and len(n.strip()) <= 40:
        n = float(n.strip())
    f = netio._num(n)
    if f is None:
        return decide.DEFAULT_SHORTLIST_N
    return max(1, min(MAX_N, int(f)))


def _safe_text(v: Any, limit: int = MAX_TEXT) -> str:
    """Text from a catalog or a user, made safe to print in chat: control characters
    and line breaks gone, length capped, @-mentions and <link> / <!channel> markup
    and backticks defused."""
    if not isinstance(v, str):
        return ""
    out = []
    for ch in v:
        cat = unicodedata.category(ch)
        if cat in ("Zs", "Zl", "Zp") or ch in "\t\r\n":
            out.append(" ")
        elif cat in ("Cc", "Cf", "Cs", "Co", "Cn"):
            continue
        else:
            out.append(ch)
    text = " ".join("".join(out).split())
    text = text.replace("@", "@​").replace("<", "‹").replace(">", "›").replace("`", "'")
    return text[:limit]


_MD_SPECIALS = re.compile(r"([\\*_~|\[\]()#])")


def _md(v: Any) -> str:
    """Escape chat-markdown characters in text printed by the slash command."""
    return _MD_SPECIALS.sub(r"\\\1", str(v))


def _names_aa(v: Any, depth: int = 0) -> bool:
    if isinstance(v, str):
        low = v.casefold().replace("-", " ").replace("_", " ")
        return "artificial analysis" in low or "artificialanalysis" in low
    if depth >= 4:
        return False
    if isinstance(v, dict):
        return any(_names_aa(x, depth + 1) for x in v.values()) or any(_names_aa(k, depth + 1) for k in v)
    if isinstance(v, (list, tuple)):
        return any(_names_aa(x, depth + 1) for x in v)
    return False


def _provenance_is_prohibited(row: dict) -> bool:
    return any(_names_aa(row.get(k)) for k in _PROVENANCE_KEYS)


def _clean_row(r: dict) -> dict:
    """A copy of a catalog row holding only known fields. Numbers are finite or None
    (a string, NaN, infinity, a huge integer or an index outside 0-100 reads as
    unknown, so one bad row is left out of scoring instead of crashing it) and
    text is safe to print."""
    row: Dict[str, Any] = {}
    for k in _TEXT_FIELDS:
        if k in r:
            row[k] = _safe_text(r[k]) or None
    if "reasoning" in r:
        v = r["reasoning"]
        row["reasoning"] = v if isinstance(v, bool) else (_safe_text(v) or None)
    url = r.get("source_url")
    if isinstance(url, str) and url.strip().casefold().startswith(("https://", "http://")):
        row["source_url"] = _safe_text(url.strip()) or None
    for k in _NUMERIC:
        if k in r:
            row[k] = netio._num(r[k])
    if "aa_intelligence_index" in r:
        row["aa_intelligence_index"] = netio.index_or_none(r["aa_intelligence_index"])
    return row


class _Rows(list):
    """Catalog rows, plus how many were refused for naming Artificial Analysis."""
    rejected = 0


def _rows(payload: Any) -> List[dict]:
    if isinstance(payload, dict) and any(_names_aa(payload.get(k)) for k in _PROVENANCE_KEYS):
        raise CatalogError("the catalog names Artificial Analysis as its source; Iolite does not load "
                           "Artificial Analysis data through catalog_path or catalog_url")
    rows = payload.get("models") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise CatalogError("catalog must be a list of rows or an object with a 'models' list")
    if len(rows) > MAX_ROWS:
        raise CatalogError(f"catalog has {len(rows)} rows; Iolite reads at most {MAX_ROWS}")
    out = _Rows()
    for r in rows:
        if not isinstance(r, dict) or not isinstance(r.get("model"), str):
            continue
        if _provenance_is_prohibited(r):
            out.rejected += 1
            continue
        clean = _clean_row(r)
        if clean.get("model"):
            out.append(clean)
    return out


_failures: Dict[str, Tuple[float, str]] = {}
_locks: Dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(cache_key: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(cache_key, threading.Lock())


def _cached_fetch(cache_key: str, ttl: float, fetch) -> Tuple[List[dict], str]:
    """Serve from cache; otherwise fetch once. A failure is remembered for
    FAIL_TTL_SECONDS and replayed, so an agent retrying a broken source spends
    no extra requests. Only Iolite's own constructed messages are remembered.
    Concurrent misses on one key wait for a single fetch."""

    def cached():
        now = time.monotonic()
        hit = _cache.get(cache_key)
        if hit and now - hit[0] < ttl:
            return hit[1], hit[2]
        failed = _failures.get(cache_key)
        if failed and now - failed[0] < FAIL_TTL_SECONDS:
            raise CatalogError(failed[1])
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
            _failures[cache_key] = (time.monotonic(), _safe_msg(exc))
            raise
        _failures.pop(cache_key, None)
        _cache[cache_key] = (time.monotonic(), rows, label)
        return rows, label


def _safe_msg(exc: BaseException) -> str:
    return str(exc) if isinstance(exc, CatalogError) else "the catalog could not be loaded"


def _validate_url(url: str) -> urllib.parse.SplitResult:
    """Refuse a catalog_url before any request is built, so no library error can
    echo it. Messages never contain the URL."""
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in url):
        raise CatalogError("catalog_url must not contain spaces or control characters")
    try:
        u = urllib.parse.urlsplit(url)
        port = u.port
    except ValueError:
        raise CatalogError("catalog_url is not a valid URL (check the host and port)") from None
    scheme = u.scheme.lower()
    if scheme not in ("https", "http"):
        raise CatalogError("catalog_url must be an https URL")
    if scheme == "http" and not _allow_http():
        raise CatalogError("catalog_url must be https; set allow_http: true to permit plain http")
    if not u.hostname:
        raise CatalogError("catalog_url has no host")
    if "@" in u.netloc:
        raise CatalogError("catalog_url must not carry a user name or password; Iolite sends no credentials")
    del port
    return u


def _redact_url(url: str) -> str:
    """scheme://host/path only: no user:password@, query string or fragment, which
    is where a private instance's token would sit. Validates first."""
    u = _validate_url(url)
    host = u.hostname or ""
    if u.port:
        host = f"{host}:{u.port}"
    return urllib.parse.urlunsplit((u.scheme, host, u.path, "", ""))


def _source_label(path: str = "", url: str = "") -> str:
    if path:
        return f"file:{_safe_text(Path(path).name, 80)}"
    try:
        return _redact_url(url)
    except CatalogError:
        return "(invalid catalog_url)"


def _read_catalog_file(path: str) -> bytes:
    """A regular file of at most MAX_BYTES. A FIFO, device or directory is refused
    before it is opened for reading, so it cannot hang the call. OS errors are
    reported by file name only, never the full path."""
    p = Path(path).expanduser()
    name = _safe_text(p.name, 80)
    try:
        st = p.stat()
        if not stat.S_ISREG(st.st_mode):
            raise CatalogError(f"catalog_path {name} is not a regular file")
        if st.st_size > MAX_BYTES:
            raise CatalogError("catalog file exceeds 8 MB")
        fd = os.open(p, os.O_RDONLY | getattr(os, "O_NONBLOCK", 0))
        with os.fdopen(fd, "rb") as fh:
            if not stat.S_ISREG(os.fstat(fh.fileno()).st_mode):  # swapped after the stat
                raise CatalogError(f"catalog_path {name} is not a regular file")
            body = fh.read(MAX_BYTES + 1)
    except OSError as exc:
        raise CatalogError(f"catalog_path {name}: {_safe_text(exc.strerror or exc.__class__.__name__, 80)}") from None
    if len(body) > MAX_BYTES:
        raise CatalogError("catalog file exceeds 8 MB")
    return body


def _parse_json(body: bytes, what: str) -> Any:
    try:
        return json.loads(body)
    except UnicodeDecodeError:
        raise CatalogError(f"{what} is not UTF-8 JSON") from None
    except (ValueError, RecursionError):
        raise CatalogError(f"{what} is not valid JSON") from None


def load_catalog() -> Tuple[List[dict], str]:
    """Return (rows, source label). Raises CatalogError when nothing is configured
    or the source cannot be read; its message is always safe to show."""
    path = str(_cfg("catalog_path") or "").strip()
    url = str(_cfg("catalog_url") or "").strip()
    if path:
        name = _safe_text(Path(path).name, 80)
        payload = _parse_json(_read_catalog_file(path), f"catalog_path {name}")
        return _rows(payload), _source_label(path=path)
    if not url:
        raise CatalogError(
            "No catalog configured. Under plugins.entries.iolite.settings, set catalog_path "
            "(a local JSON file) or catalog_url (an https Iolite /api/v1/models.json you may use). "
            "The repository's demo/synthetic-catalog.json is invented data you can try first."
        )
    label = _redact_url(url)  # validates before any request exists

    def fetch():
        timeout = _timeout()
        deadline = time.monotonic() + timeout
        try:
            req = urllib.request.Request(url, headers={"User-Agent": f"iolite-hermes/{VERSION}",
                                                       "Accept": "application/json"})
            opener = _url_opener or netio.open_same_origin
            with opener(req, timeout) as resp:
                body = netio.read_capped(resp, deadline, MAX_BYTES, f"catalog_url {label}")
        except urllib.error.HTTPError as exc:
            if 300 <= exc.code < 400:
                raise CatalogError(f"catalog_url {label} redirected to another origin; refused") from None
            raise CatalogError(f"catalog_url {label} returned HTTP {exc.code}") from None
        except TimeoutError:
            raise CatalogError(f"catalog_url {label} did not answer within {timeout:g} s") from None
        except urllib.error.URLError as exc:
            reason = exc.reason if isinstance(exc.reason, str) else exc.reason.__class__.__name__
            raise CatalogError(f"could not reach catalog_url {label}: {_safe_text(reason, 80)}") from None
        except (ValueError, http.client.HTTPException):
            raise CatalogError(f"catalog_url {label} is not a valid URL") from None
        except OSError as exc:
            raise CatalogError(f"could not reach catalog_url {label}: {exc.__class__.__name__}") from None
        except Exception as exc:  # never str(exc): library messages can carry the URL
            raise CatalogError(f"could not read catalog_url {label} ({exc.__class__.__name__})") from None
        if len(body) > MAX_BYTES:
            raise CatalogError("catalog response exceeds 8 MB")
        try:
            payload = json.loads(body)
        except (ValueError, RecursionError):
            raise CatalogError(f"catalog_url {label} did not return JSON") from None
        return _rows(payload), label
    return _cached_fetch(hashlib.sha256(url.encode()).hexdigest(), _num_cfg("cache_minutes") * 60, fetch)


def _summary(m: dict) -> dict:
    return {k: m.get(k) for k in _FIELDS if k in m}


def _dumps(obj: Any) -> str:
    return json.dumps(obj, allow_nan=False)


def _err(msg: str) -> str:
    return _dumps({"ok": False, "error": msg})


def _resolve_anchor(rows: List[dict], anchor: str) -> dict:
    """The one catalog row `anchor` names: a slug, else an exact model name, else a
    case-insensitive one. A name shared by several rows is refused, never guessed."""
    q = anchor.strip()
    shown = _safe_text(q, 80)
    for hits in (
        [r for r in rows if r.get("slug") and str(r["slug"]).casefold() == q.casefold()],
        [r for r in rows if r.get("model") == q],
        [r for r in rows if str(r.get("model", "")).casefold() == q.casefold()],
    ):
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1:
            slugs = [str(r["slug"]) for r in hits if r.get("slug")][:4]
            hint = f"; use the slug ({', '.join(slugs)})" if slugs else "; the catalog gives them no slug to tell them apart"
            raise ArgError(f"anchor_model {shown!r} matches {len(hits)} rows{hint}")
    raise ArgError(f"anchor_model {shown!r} not found")


def iolite_shortlist(args: Optional[dict] = None, **_kw) -> str:
    try:
        if args is None:
            args = {}
        if not isinstance(args, dict):
            return _err("arguments must be an object")
        try:
            rows, source = load_catalog()
        except Exception as exc:  # never raise into Hermes
            return _err(_safe_msg(exc))
        try:
            return _shortlist(rows, source, args)
        except ArgError as exc:
            return _err(str(exc))
        except Exception:  # one malformed catalog row must not become a traceback
            logger.debug("iolite: shortlist failed", exc_info=True)
            return _err("the catalog has a row Iolite cannot score; check its numbers")
    except Exception:
        logger.debug("iolite: shortlist failed", exc_info=True)
        return _err("Iolite hit an unexpected error")


def _shortlist(rows: List[dict], source: str, args: dict) -> str:
    objective = args.get("objective") or "balanced"
    if not isinstance(objective, str) or objective not in OBJECTIVES:
        return _err(f"objective must be one of {sorted(OBJECTIVES)}")
    fixed = OBJECTIVES[objective]
    bias_arg = _arg_number(args, "bias")
    bias = decide.clamp_bias(fixed if fixed is not None else
                             (decide.DEFAULT_COST_SPEED_BIAS if bias_arg is None else bias_arg))
    floor_arg = _arg_number(args, "floor")
    n_arg = _arg_number(args, "n")
    n = decide.DEFAULT_SHORTLIST_N if n_arg is None else _clamp_n(n_arg)

    anchor = args.get("anchor_model")
    if anchor is not None and not isinstance(anchor, str):
        return _err("anchor_model must be a model name")
    anchor_row = None
    if anchor and anchor.strip():
        anchor_row = _resolve_anchor(rows, anchor)
        floor = decide.floor_from_anchor([anchor_row], anchor_row["model"])
        if floor is None:
            raise ArgError(f"anchor_model {_safe_text(anchor, 80)!r} has no valid score to use as a floor")
        floor_source = "anchor"
    elif floor_arg is not None:
        floor, floor_source = decide.clamp_floor(floor_arg), "user"
    else:
        floor, floor_source = decide.DEFAULT_INTELLIGENCE_FLOOR, "default"

    out = decide.shortlist_from_decide(rows, floor, bias, n)
    reason = decide.bias_reason(bias)
    scorable = [r for r in rows if decide.is_scorable(r)]
    refusals: List[str] = []
    if not out["eligible"]:
        refusals = ["no_pick_eligible_models" if scorable else "no_scorable_models"]
    res: Dict[str, Any] = {
        "ok": True,
        "schema_version": "1.0",
        "floor_applied": {"aa_intelligence_index": floor, "source": floor_source},
        "objective": objective,
        "cost_speed_bias": bias,
        "eligible_count": len(out["eligible"]),
        "pareto_count": len(out["pareto"]),
        "scorable_count": len(scorable),
        "shortlist": [dict(rank=i + 1, reasons=["on_pareto", reason], **_summary(m))
                      for i, m in enumerate(out["shortlist"])],
        "refusals": refusals,
        "catalog_snapshot_id": decide.catalog_snapshot_id(rows),
        "catalog_source": source,
    }
    if scorable:
        res["max_scorable_index"] = max(r["aa_intelligence_index"] for r in scorable)
    if anchor_row is not None:
        res["anchor"] = {"model": anchor_row.get("model"), "slug": anchor_row.get("slug")}
    rejected = getattr(rows, "rejected", 0)
    if rejected:
        res["rows_refused_for_provenance"] = rejected
    return _dumps(res)


def iolite_model(args: Optional[dict] = None, **_kw) -> str:
    try:
        if args is not None and not isinstance(args, dict):
            return _err("arguments must be an object")
        q = _safe_text((args or {}).get("query"), 200).strip().casefold() if isinstance((args or {}).get("query"), str) else ""
        if not q:
            return _err("query is required")
        try:
            rows, source = load_catalog()
        except Exception as exc:
            return _err(_safe_msg(exc))
        exact = [r for r in rows if q in (str(r.get("model", "")).casefold(), str(r.get("slug", "")).casefold())]
        hits = exact or [r for r in rows
                         if q in str(r.get("model", "")).casefold() or q in str(r.get("slug", "")).casefold()]
        res: Dict[str, Any] = {"ok": True, "matches": [_summary(r) for r in hits[:10]],
                               "total_matches": len(hits), "catalog_source": source}
        if getattr(rows, "rejected", 0):
            res["rows_refused_for_provenance"] = rows.rejected
        return _dumps(res)
    except Exception:
        logger.debug("iolite: model lookup failed", exc_info=True)
        return _err("Iolite hit an unexpected error")


_HELP = """/iolite picks a model by intelligence floor, then cost and speed.

  /iolite shortlist [floor|anchor model] [cheap|fast|balanced] [n=3] [bias=0]
      e.g. /iolite shortlist 60 cheap
           /iolite shortlist Claude Opus 5.5 fast n=5
           /iolite shortlist "Grok 4 Fast" cheap
      A lone number is the floor; any other words name the anchor model. Only the
      last word can be an objective, and a quoted name is never read as one.
  /iolite model <name or slug>
  /iolite status     which catalog source is set, with no network call
  /iolite help"""

_OBJECTIVE_WORDS = {"cheap": "min_cost", "cheapest": "min_cost", "min_cost": "min_cost",
                    "fast": "max_speed", "fastest": "max_speed", "max_speed": "max_speed",
                    "balanced": "balanced"}


def _money(v: Any) -> str:
    """Dollars per million tokens. Under $1 keeps three significant figures, so
    $0.004/M doesn't print as $0.00/M."""
    if netio._num(v) is None:
        return "?"
    return f"${v:.3g}/M" if 0 < v < 1 else f"${v:,.2f}/M"


def _num(v: Any, unit: str) -> str:
    """Speeds under 10 keep one decimal, so 0.4 tok/s doesn't print as 0."""
    if netio._num(v) is None:
        return "?"
    return f"{v:,.1f} {unit}" if 0 < v < 10 else f"{v:,.0f} {unit}"


def _parse_words(rest: str) -> Tuple[dict, Optional[str]]:
    """Parse /iolite shortlist arguments. Returns (args, tail), where tail is the
    last word when it was read as an objective, so the caller can put it back if
    the whole phrase turns out to be a model name."""
    try:
        words = shlex.split(rest)
    except ValueError as exc:
        raise ValueError(f"could not read the arguments: {exc}") from None
    args: Dict[str, Any] = {}
    rest_words: List[str] = []
    for w in words:
        low = w.casefold()
        if low.startswith("n=") and not any(c.isspace() for c in w):
            try:
                args["n"] = int(low[2:])
            except ValueError:
                raise ValueError(f"n must be a whole number, got {_safe_text(w[2:], 40)!r}") from None
        elif low.startswith("bias=") and not any(c.isspace() for c in w):
            try:
                args["bias"] = float(low[5:])
            except ValueError:
                raise ValueError(f"bias must be a number from -1 to 1, got {_safe_text(w[5:], 40)!r}") from None
        else:
            rest_words.append(w)
    tail = None
    # Only the last, unquoted word can be an objective ("Grok 4 Fast" is a name).
    if rest_words and not any(c.isspace() for c in rest_words[-1]) \
            and rest_words[-1].casefold() in _OBJECTIVE_WORDS:
        tail = rest_words.pop()
        args["objective"] = _OBJECTIVE_WORDS[tail.casefold()]
    # One word that is a number is the floor. Anything else is a model name,
    # numbers included ("Claude Opus 5.5", "Synthetic Model 07").
    if len(rest_words) == 1:
        try:
            floor = float(rest_words[0])
        except ValueError:
            floor = None
        if floor is not None:
            if floor != floor or floor in (float("inf"), float("-inf")):
                raise ValueError(f"the floor must be a number from 0 to 100, got {_safe_text(rest_words[0], 40)!r}")
            args["floor"] = floor
            return args, tail
    if rest_words:
        args["anchor_model"] = " ".join(rest_words)
    return args, tail


def _parse_shortlist(rest: str) -> dict:
    return _parse_words(rest)[0]


def _credit_lines(rows: List[dict]) -> str:
    seen: List[str] = []
    for m in rows:
        for k in ("attribution", "license"):
            v = m.get(k)
            if v and v not in seen:
                seen.append(v)
    return "".join(f"\nData: {_md(v)}" for v in seen[:5])


def _provenance_line(res: dict) -> str:
    n = res.get("rows_refused_for_provenance")
    return f"\n{n} catalog rows were refused: their source names Artificial Analysis." if n else ""


def _fmt_shortlist(res: dict) -> str:
    if not res.get("ok"):
        return f"Iolite: {res.get('error')}"
    fl = res["floor_applied"]
    head = (f"Floor {fl['aa_intelligence_index']:g} ({fl['source']}), {res['objective']}: "
            f"{res['eligible_count']} models clear it, {res['pareto_count']} on the cost x speed front.")
    if not res["shortlist"]:
        if not res.get("scorable_count"):
            advice = ("No row in this catalog has price, speed and score all known, so no floor can help. "
                      "Add the missing fields to the catalog, or point Iolite at one that has them.")
        else:
            top = res.get("max_scorable_index")
            advice = (f"{res['scorable_count']} models have price, speed and score, but none reaches the floor"
                      + (f" (the highest score is {top:g}). Try a floor at or below {top:g}." if top is not None else "."))
        return head + "\n" + advice + _provenance_line(res)
    lines = [head]
    for m in res["shortlist"]:
        lines.append(f"{m['rank']}. {_md(m.get('model'))} ({_md(m.get('provider') or '?')}): index "
                     f"{m.get('aa_intelligence_index')}, {_money(m.get('blended_price_per_M'))}, "
                     f"{_num(m.get('tps'), 'tok/s')}")
    return "\n".join(lines) + _credit_lines(res["shortlist"]) + _provenance_line(res)


def _fmt_model(res: dict) -> str:
    if not res.get("ok"):
        return f"Iolite: {res.get('error')}"
    if not res["matches"]:
        return "No model matches that name." + _provenance_line(res)
    lines = [f"{_md(m.get('model'))} ({_md(m.get('provider') or '?')}): index "
             f"{m.get('aa_intelligence_index') if m.get('aa_intelligence_index') is not None else '?'}, "
             f"{_money(m.get('blended_price_per_M'))}, {_num(m.get('tps'), 'tok/s')}, "
             f"context {_num(m.get('context_length'), 'tokens')}"
             for m in res["matches"]]
    more = res["total_matches"] - len(res["matches"])
    if more > 0:
        lines.append(f"...and {more} more. Use a longer name.")
    return "\n".join(lines) + _credit_lines(res["matches"]) + _provenance_line(res)


def _status() -> str:
    path = str(_cfg("catalog_path") or "").strip()
    url = str(_cfg("catalog_url") or "").strip()
    if path:
        src = f"catalog_path ({_source_label(path=path)})"
    elif url:
        src = f"catalog_url {_source_label(url=url)}"
    else:
        src = "none. Set catalog_path or catalog_url"
    return f"Iolite {VERSION}\nSource: {src}"


def _whole_name_is_in_catalog(name: str) -> bool:
    try:
        rows, _ = load_catalog()
    except Exception:
        return False
    q = name.casefold()
    return any(q in (str(r.get("model", "")).casefold(), str(r.get("slug", "")).casefold()) for r in rows)


def _slash(raw_args: str) -> str:
    try:
        parts = (raw_args or "").split(None, 1)
        cmd = parts[0].casefold() if parts else ""
        rest = parts[1].strip() if len(parts) > 1 else ""
        if cmd in ("", "help", "-h", "--help"):
            return _HELP
        if cmd == "status":
            return _status()
        if cmd == "model":
            try:
                query = " ".join(shlex.split(rest))
            except ValueError:
                query = rest  # an unmatched quote is part of the name
            if not query:
                return "Name a model: /iolite model <name or slug>"
            return _fmt_model(json.loads(iolite_model({"query": query})))
        if cmd == "shortlist":
            args, tail = _parse_words(rest)
            if tail and args.get("anchor_model") and _whole_name_is_in_catalog(f"{args['anchor_model']} {tail}"):
                args["anchor_model"] = f"{args['anchor_model']} {tail}"  # "Grok 4 Fast" is a name
                args.pop("objective", None)
            return _fmt_shortlist(json.loads(iolite_shortlist(args)))
        return f"Unknown subcommand {_safe_text(cmd, 40)!r}.\n\n{_HELP}"
    except ValueError as exc:
        return f"{_safe_text(str(exc), 300)}\n\n{_HELP}"
    except Exception:  # never raise into the chat surface
        logger.debug("iolite: slash command failed", exc_info=True)
        return "Iolite hit an unexpected error. Try /iolite status."


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
