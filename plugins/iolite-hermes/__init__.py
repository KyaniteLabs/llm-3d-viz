"""Iolite for Hermes: pick a model by intelligence floor, then cost x speed.

Tools
  iolite_shortlist  floor (or anchor model) + objective -> Pareto shortlist with reasons
  iolite_model      look up one catalog row by name or slug
Slash command
  /iolite shortlist | model | status | help, the same answers from chat
Skill
  iolite:iolite walks the agent through floor, objective and the answer

Data source. First one set wins:
  catalog_path       a local JSON file: a list of rows or {"models": [...]}
  catalog_url        an https URL of an Iolite /api/v1/models.json you are allowed to read,
                     e.g. your own private instance. Fetched with a plain GET, cached in
                     memory. Plain http needs allow_http: true.
  (neither)          the catalog bundled in data/catalog.json: Epoch AI's Capabilities Index
                     and the LMArena leaderboard for intelligence, LiteLLM's price file for
                     cost. Licences and credits are in ATTRIBUTION.md.

Speed has no public source. When measure_speed is on (the default) a post_api_request
hook records tokens per second of your own model calls in a small JSON file in the plugin
data directory, and answers use it, labelled as measured locally. Nothing is uploaded.
Rows whose source or provenance names Artificial Analysis are refused. Every public path
returns a JSON string (or, for the slash command, text) and never raises into Hermes.
"""

from __future__ import annotations

import http.client
import hashlib
import json
import logging
import os
import re
import shlex
import statistics
import stat
import tempfile
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
VERSION = "0.4.0"
DEFAULTS: Dict[str, Any] = {
    "catalog_url": "",
    "catalog_path": "",
    "allow_http": False,
    "cache_minutes": 60,
    "timeout_seconds": 15,
    "measure_speed": True,
    "remember_shortlist": True,
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
        "Models below the floor or missing price or score are excluded; the rest are reduced to the "
        "cost x speed Pareto front (when every candidate has a locally measured speed) or to the "
        "cost x intelligence front (speed not measured yet) and ranked by objective. Give floor (0-100, "
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
    "description": "Look up one model in the Iolite catalog (bundled unless catalog_path or catalog_url is set) by name or slug (case-insensitive; substring match if no exact hit).",
    "parameters": {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "A model name or slug, e.g. 'gpt-5' or 'Claude Opus 5.5'."}},
        "required": ["query"],
    },
}


_FIELDS = ("model", "slug", "provider", "openness", "reasoning", "context_length", "tps", "ttft",
           "blended_price_per_M", "intelligence", "intelligence_metric", "intelligence_as_of",
           "arena_rating", "price_provider", "tps_note", "data_date",
           "source", "source_url", "license", "attribution")
_TEXT_FIELDS = ("model", "slug", "provider", "openness", "data_date", "source", "license", "attribution")
_NUMERIC = ("context_length", "tps", "ttft", "blended_price_per_M")
_PROVENANCE_KEYS = ("source", "sources", "source_url", "provenance", "attribution", "data_source",
                    "license", "licence", "origin", "citation", "intelligence", "price", "arena")
BUNDLED_CATALOG = Path(__file__).with_name("data") / "catalog.json"


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
    text = text.replace("@", "@\u200b").replace("<", "\u2039").replace(">", "\u203a").replace("`", "'")
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
    price = r.get("price") if isinstance(r.get("price"), dict) else {}
    intel = r.get("intelligence") if isinstance(r.get("intelligence"), dict) else {}
    arena = r.get("arena") if isinstance(r.get("arena"), dict) else {}
    for k in _NUMERIC:
        if k in r:
            row[k] = netio._num(r[k])
    if "blended_price_per_M" not in row and price:
        row["blended_price_per_M"] = netio._num(price.get("blended_per_M"))
    # Intelligence: the nested catalog block, the flat `intelligence` number, or the
    # deprecated flat `aa_intelligence_index` alias, in that order.
    if intel:
        row["intelligence"] = netio.index_or_none(intel.get("value"))
    elif "intelligence" in r:
        row["intelligence"] = netio.index_or_none(r["intelligence"])
    elif "aa_intelligence_index" in r:
        row["intelligence"] = netio.index_or_none(r["aa_intelligence_index"])
    credits: List[str] = []
    if intel:
        row["intelligence_metric"] = _safe_text(intel.get("metric"), 80) or None
        row["intelligence_as_of"] = _safe_text(intel.get("as_of"), 20) or None
        credits.append(_safe_text(intel.get("attribution"), 600))
    if arena:
        row["arena_rating"] = netio._num(arena.get("rating"))
        credits.append(_safe_text(arena.get("attribution"), 600))
    if price:
        row["price_provider"] = _safe_text(price.get("litellm_provider"), 60) or None
        src = _safe_text(price.get("source"), 120)
        lic = _safe_text(price.get("license"), 20)
        if src:
            credits.append(f"Prices: {src}" + (f", {lic} licence" if lic else "") + ".")
        key = price.get("litellm_key")
        if isinstance(key, str):
            row["_price_key"] = key
    row["_credits"] = [c for c in credits if c]
    return row


class _Rows(list):
    """Catalog rows, plus how many were refused for naming Artificial Analysis and the
    catalog's own header (when it has one)."""
    rejected = 0
    meta: Dict[str, str] = {}


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
    out.meta = {}
    if isinstance(payload, dict):
        for k in ("generated", "schema"):
            if isinstance(payload.get(k), str):
                out.meta[k] = _safe_text(payload[k], 40)
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


_bundled_cache: Dict[Tuple[int, int], List[dict]] = {}


def _bundled_catalog() -> Tuple[List[dict], str]:
    """The catalog shipped in data/catalog.json, parsed once per file version."""
    try:
        st = BUNDLED_CATALOG.stat()
    except OSError:
        raise CatalogError("the bundled catalog (data/catalog.json) is missing; reinstall the plugin, "
                           "or set catalog_path or catalog_url") from None
    key = (st.st_mtime_ns, st.st_size)
    rows = _bundled_cache.get(key)
    if rows is None:
        rows = _rows(_parse_json(_read_catalog_file(str(BUNDLED_CATALOG)), "the bundled catalog"))
        _bundled_cache.clear()
        _bundled_cache[key] = rows
    return rows, "bundled catalog"


def load_catalog() -> Tuple[List[dict], str]:
    """Return (rows, source label). catalog_path wins, then catalog_url, else the bundled
    catalog. Raises CatalogError when the source cannot be read; its message is always safe
    to show. Rows carry any locally measured speed (see _with_speed)."""
    rows, label = _load_base_catalog()
    return _with_speed(rows), label


def _load_base_catalog() -> Tuple[List[dict], str]:
    path = str(_cfg("catalog_path") or "").strip()
    url = str(_cfg("catalog_url") or "").strip()
    if path:
        name = _safe_text(Path(path).name, 80)
        payload = _parse_json(_read_catalog_file(path), f"catalog_path {name}")
        return _rows(payload), _source_label(path=path)
    if not url:
        return _bundled_catalog()
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


# ----------------------------------------------------------------------------- local speed
#
# No public source gives lawful per-model speed numbers, so Iolite measures your own: a
# post_api_request hook keeps a rolling median of output tokens per second per model in a
# small JSON file in the plugin data directory. It never leaves the machine.

SPEED_FILE = "speed.json"
SPEED_WINDOW = 25        # samples kept per model
SPEED_MIN_SAMPLES = 3    # a speed is shown only after this many calls
SPEED_MIN_TOKENS = 20    # shorter replies say little about throughput
SPEED_MIN_SECONDS = 0.25
SPEED_MAX_TPS = 5000.0   # above this the timing is wrong, not the model fast
SPEED_MAX_MODELS = 500
SPEED_MAX_BYTES = 1024 * 1024
SPEED_LABEL = "measured locally on this machine, {date}; not comparable across machines"
_speed_lock = threading.Lock()


def _truthy_cfg(key: str) -> bool:
    v = _cfg(key)
    if isinstance(v, str):
        return v.strip().casefold() not in ("false", "no", "0", "off", "")
    return bool(v)


def _measure_speed_on() -> bool:
    return _truthy_cfg("measure_speed")


def _data_dir() -> Path:
    """The plugin's profile-scoped data directory: ctx.state.data_dir when Hermes gave us a
    context, else $HERMES_HOME/plugin-data/iolite, else ~/.hermes/plugin-data/iolite."""
    try:
        d = getattr(getattr(_ctx, "state", None), "data_dir", None) if _ctx is not None else None
        if d:
            return Path(d)
    except Exception:
        pass
    home = os.environ.get("HERMES_HOME") or str(Path.home() / ".hermes")
    return Path(home) / "plugin-data" / "iolite"


def _speed_key(name: Any) -> str:
    """A model id reduced to lowercase letters and digits, provider prefix and trailing
    date dropped: 'anthropic/claude-opus-4.6' and 'claude-opus-4-6' both give 'claudeopus46'."""
    if not isinstance(name, str):
        return ""
    ident = name.strip().split("/")[-1]
    ident = re.sub(r"[-@_](?:\d{8}|\d{4}-\d{2}-\d{2})$", "", ident)
    return re.sub(r"[^a-z0-9]", "", ident.casefold())


def _read_speeds() -> Dict[str, dict]:
    """The recorded speeds: {key: {"model", "median_tps", "n", "updated"}}. Anything
    unreadable or malformed is an empty record; this never raises."""
    try:
        path = _data_dir() / SPEED_FILE
        st = path.stat()
        if not stat.S_ISREG(st.st_mode) or st.st_size > SPEED_MAX_BYTES:
            return {}
        data = json.loads(path.read_bytes())
        models = data.get("models") if isinstance(data, dict) else None
        return models if isinstance(models, dict) else {}
    except Exception:
        return {}


def _write_speeds(models: Dict[str, dict]) -> None:
    d = _data_dir()
    d.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".speed-", suffix=".tmp", dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump({"version": 1, "note": "tokens per second of your own calls, measured locally; "
                       "never uploaded", "models": models}, fh, allow_nan=False)
        os.chmod(tmp, 0o600)
        os.replace(tmp, d / SPEED_FILE)  # atomic: a reader sees the old file or the new one
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _tokens_per_second(api_duration: Any, started_at: Any, first_chunk_at: Any, usage: Any) -> Optional[float]:
    """Output tokens / generation seconds, or None when the call says too little. When the
    call streamed, time to the first chunk is not generation time and is left out."""
    if not isinstance(usage, dict):
        return None
    tokens = netio._num(usage.get("output_tokens"))
    seconds = netio._num(api_duration)
    if tokens is None or seconds is None or tokens < SPEED_MIN_TOKENS:
        return None
    start, first = netio._num(started_at), netio._num(first_chunk_at)
    if start is not None and first is not None and 0 <= first - start < seconds:
        seconds -= first - start
    if seconds < SPEED_MIN_SECONDS:
        return None
    tps = tokens / seconds
    return tps if 0 < tps <= SPEED_MAX_TPS else None


def _on_post_api_request(model: Any = None, api_duration: Any = None, started_at: Any = None,
                         first_chunk_at: Any = None, usage: Any = None, **_kw) -> None:
    """Hermes post_api_request hook. Records one speed sample; never raises into Hermes."""
    try:
        if not _measure_speed_on():
            return
        key = _speed_key(model)
        tps = _tokens_per_second(api_duration, started_at, first_chunk_at, usage)
        if not key or tps is None:
            return
        with _speed_lock:
            models = _read_speeds()
            entry = models.get(key) if isinstance(models.get(key), dict) else {}
            samples = [x for x in (entry.get("samples") or []) if netio._num(x) is not None]
            samples = (samples + [round(tps, 2)])[-SPEED_WINDOW:]
            models[key] = {"model": _safe_text(str(model), 80), "samples": samples,
                           "median_tps": round(statistics.median(samples), 2), "n": len(samples),
                           "updated": time.strftime("%Y-%m-%d")}
            if len(models) > SPEED_MAX_MODELS:
                for old in sorted(models, key=lambda k: str(models[k].get("updated", "")))[:len(models) - SPEED_MAX_MODELS]:
                    models.pop(old, None)
            _write_speeds(models)
    except Exception:
        logger.debug("iolite: could not record a speed sample", exc_info=True)


def _with_speed(rows: List[dict]) -> List[dict]:
    """Rows with locally measured speed filled in where the catalog has none. The catalog's
    own rows are never changed; matched rows are copies. A model matches on its slug, name or
    price-file id, whole and exact, and needs SPEED_MIN_SAMPLES calls."""
    try:
        if not _measure_speed_on():
            return rows
        speeds = {k: v for k, v in _read_speeds().items()
                  if isinstance(v, dict) and netio._num(v.get("median_tps")) is not None
                  and (netio._num(v.get("n")) or 0) >= SPEED_MIN_SAMPLES}
        if not speeds:
            return rows
        out = _Rows()
        out.rejected, out.meta = getattr(rows, "rejected", 0), getattr(rows, "meta", {})
        for r in rows:
            hit = None
            if r.get("tps") is None:
                for cand in (r.get("slug"), r.get("model"), r.get("_price_key")):
                    k = _speed_key(cand)
                    if k and k in speeds:
                        hit = speeds[k]
                        break
            if hit is None:
                out.append(r)
            else:
                out.append({**r, "tps": float(hit["median_tps"]),
                            "tps_note": SPEED_LABEL.format(date=_safe_text(str(hit.get("updated", "")), 10) or "unknown date")})
        return out
    except Exception:
        logger.debug("iolite: could not merge local speeds", exc_info=True)
        return rows


# ----------------------------------------------------------------------------- landscape (Desktop pane)
LAST_SHORTLIST_FILE = "last_shortlist.json"
LANDSCAPE_MAX_PICKS = 25


def _remember_shortlist(res: dict) -> None:
    """Keep the floor and picks of the latest /iolite shortlist in the plugin data directory,
    so the Desktop landscape pane can mark them. Best effort: never raises, writes nothing when
    remember_shortlist is off. Only the floor, objective and picked slugs are kept, never the
    arguments' free text, and nothing leaves the machine."""
    try:
        if not _truthy_cfg("remember_shortlist") or not res.get("ok"):
            return
        picks = [_safe_text(m.get("slug") or m.get("model"), 120) for m in res.get("shortlist") or ()
                 if isinstance(m, dict) and (m.get("slug") or m.get("model"))][:LANDSCAPE_MAX_PICKS]
        floor = res.get("floor_applied") or {}
        record = {"version": 1, "saved": time.strftime("%Y-%m-%d"),
                  "floor": floor.get("intelligence"), "floor_source": floor.get("source"),
                  "objective": res.get("objective"), "mode": res.get("mode"), "picks": picks}
        d = _data_dir()
        d.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".last-", suffix=".tmp", dir=d)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(record, fh, allow_nan=False)
            os.chmod(tmp, 0o600)
            os.replace(tmp, d / LAST_SHORTLIST_FILE)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
    except Exception:
        logger.debug("iolite: could not remember the shortlist", exc_info=True)


def _read_last_shortlist() -> Optional[dict]:
    """The remembered shortlist, validated field by field, or None. Never raises."""
    try:
        path = _data_dir() / LAST_SHORTLIST_FILE
        st = path.stat()
        if not stat.S_ISREG(st.st_mode) or st.st_size > 64 * 1024:
            return None
        data = json.loads(path.read_bytes())
        if not isinstance(data, dict) or not isinstance(data.get("picks"), list):
            return None
        floor = netio._num(data.get("floor"))
        return {"floor": floor if floor is not None and 0 <= floor <= 100 else None,
                "floor_source": _safe_text(data.get("floor_source"), 20) or None,
                "objective": _safe_text(data.get("objective"), 20) or None,
                "saved": _safe_text(data.get("saved"), 10) or None,
                "picks": [_safe_text(p, 120) for p in data["picks"][:LANDSCAPE_MAX_PICKS] if isinstance(p, str)]}
    except Exception:
        return None


def landscape_state() -> dict:
    """What the Desktop landscape pane reads over REST: locally measured speeds (by catalog
    slug), the latest remembered shortlist and floor, and which catalog /iolite is using. Local
    files only, no network. Speeds appear only where measure_speed is on and a model has at
    least SPEED_MIN_SAMPLES calls; a model with no measurement is absent, never estimated."""
    out: Dict[str, Any] = {"ok": True, "version": VERSION, "measure_speed": _measure_speed_on(),
                           "speed": {}, "speed_label": SPEED_LABEL.format(date="date per model"),
                           "last_shortlist": _read_last_shortlist()}
    try:
        rows, source = load_catalog()
        out["catalog_source"] = source
        out["bundled"] = source == "bundled catalog"
        for r in rows:
            tps = netio._num(r.get("tps"))
            slug = r.get("slug")
            if tps is not None and tps > 0 and isinstance(slug, str) and slug:
                out["speed"][slug] = {"tps": tps, "note": r.get("tps_note")}
    except Exception as exc:
        out["catalog_source"] = None
        out["bundled"] = False
        out["catalog_error"] = _safe_msg(exc)
    return out


def _data_credits(rows: List[dict]) -> List[str]:
    """The distinct credit lines of the rows being shown (the licences ask for them)."""
    seen: List[str] = []
    for m in rows:
        for c in m.get("_credits") or ():
            if c and c not in seen:
                seen.append(c)
    return seen[:6]


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
            text = _shortlist(rows, source, args)
            try:
                _remember_shortlist(json.loads(text))
            except Exception:
                logger.debug("iolite: could not remember the shortlist", exc_info=True)
            return text
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
    mode = out["mode"]
    reason = decide.bias_reason(bias)
    scorable = [r for r in rows if decide.is_scorable(r, need_speed=False)]
    refusals: List[str] = []
    if not out["eligible"]:
        refusals = ["no_pick_eligible_models" if scorable else "no_scorable_models"]
    res: Dict[str, Any] = {
        "ok": True,
        "schema_version": "1.0",
        "floor_applied": {"intelligence": floor, "source": floor_source},
        "mode": mode,
        "speed": ("measured locally on this machine; not comparable across machines"
                  if mode == "cost_speed" else "not measured yet"),
        "objective": objective,
        "cost_speed_bias": bias,
        "eligible_count": len(out["eligible"]),
        "pareto_count": len(out["pareto"]),
        "front": "cost x speed" if mode == "cost_speed" else "cost x intelligence",
        "scorable_count": len(scorable),
        "shortlist": [dict(rank=i + 1, reasons=["on_pareto" if mode == "cost_speed" else "on_cost_front", reason],
                           **_summary(m))
                      for i, m in enumerate(out["shortlist"])],
        "refusals": refusals,
        "catalog_snapshot_id": decide.catalog_snapshot_id(rows),
        "catalog_source": source,
    }
    if scorable:
        res["max_scorable_intelligence"] = max(decide.intelligence_of(r) for r in scorable)
    if anchor_row is not None:
        res["anchor"] = {"model": anchor_row.get("model"), "slug": anchor_row.get("slug")}
    rejected = getattr(rows, "rejected", 0)
    if rejected:
        res["rows_refused_for_provenance"] = rejected
    res["data_credits"] = _data_credits(out["shortlist"])
    snap = getattr(rows, "meta", {}).get("generated")
    if snap:
        res["catalog_generated"] = snap
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
                               "total_matches": len(hits), "catalog_source": source,
                               "data_credits": _data_credits(hits[:10])}
        if getattr(rows, "rejected", 0):
            res["rows_refused_for_provenance"] = rows.rejected
        return _dumps(res)
    except Exception:
        logger.debug("iolite: model lookup failed", exc_info=True)
        return _err("Iolite hit an unexpected error")


_HELP = """/iolite picks a model by intelligence floor, then cost and speed.

  /iolite shortlist [floor|anchor model] [cheap|fast|balanced] [n=3] [bias=0]
      Works on the bundled catalog with no setup. Until it has measured your model speeds,
      "fast" favours the smarter model, since speed is not measured yet.
      e.g. /iolite shortlist 60 cheap
           /iolite shortlist Claude Opus 5.5 fast n=5
           /iolite shortlist "Grok 4 Fast" cheap
      A lone number is the floor; any other words name the anchor model. Only the
      last word can be an objective, and a quoted name is never read as one.
  /iolite model <name or slug>
  /iolite status     catalog source, snapshot date, data credits and speed measuring, no network call
  /iolite help"""

_OBJECTIVE_WORDS = {"cheap": "min_cost", "cheapest": "min_cost", "min_cost": "min_cost",
                    "fast": "max_speed", "fastest": "max_speed", "max_speed": "max_speed",
                    "balanced": "balanced"}


def _money(v: Any) -> str:
    """Dollars per million tokens, always in cents ($0.20/M, $2.00/M). Prices
    under a cent keep three significant figures, so $0.004/M doesn't print as
    $0.00/M. A listed price of zero is a provider's free tier, and says so."""
    if netio._num(v) is None:
        return "?"
    if v == 0:
        return "$0/M (free tier)"
    return f"${v:.3g}/M" if 0 < v < 0.01 else f"${v:,.2f}/M"


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


def _metric_tag(m: dict) -> str:
    metric = m.get("intelligence_metric") or ""
    return " (ECI)" if metric.startswith("Epoch") else " (LMArena)" if metric.startswith("LMArena") else ""


def _speed_text(m: dict) -> str:
    return f"{_num(m.get('tps'), 'tok/s')} (local)" if m.get("tps") is not None else "speed: not measured yet"


def _speed_footer(rows: List[dict]) -> str:
    notes = sorted({m["tps_note"] for m in rows if m.get("tps_note")})
    return "".join(f"\nSpeed {_md(n)}." for n in notes[:2])


def _provenance_line(res: dict) -> str:
    n = res.get("rows_refused_for_provenance")
    return f"\n{n} catalog rows were refused: their source names Artificial Analysis." if n else ""


def _fmt_shortlist(res: dict) -> str:
    if not res.get("ok"):
        return f"Iolite: {res.get('error')}"
    fl = res["floor_applied"]
    head = (f"Floor {fl['intelligence']:g} ({fl['source']}), {res['objective']}: "
            f"{res['eligible_count']} models clear it, {res['pareto_count']} on the {res.get('front', 'cost x speed')} front.")
    if res.get("mode") == "cost":
        head += "\nSpeed: not measured yet, so these are ranked on cost and intelligence."
        if res.get("objective") == "max_speed" or (res.get("cost_speed_bias") or 0) > 0.25:
            head += " 'Fast' favours the smarter model here."
    if not res["shortlist"]:
        if not res.get("scorable_count"):
            advice = ("No row in this catalog has both a price and a score, so no floor can help. "
                      "Add the missing fields to the catalog, or point Iolite at one that has them.")
        else:
            top = res.get("max_scorable_intelligence")
            advice = (f"{res['scorable_count']} models have a price and a score, but none reaches the floor"
                      + (f" (the highest score is {top:g}). Try a floor at or below {top:g}." if top is not None else "."))
        return head + "\n" + advice + _provenance_line(res)
    lines = [head]
    for m in res["shortlist"]:
        lines.append(f"{m['rank']}. {_md(m.get('model'))} ({_md(m.get('provider') or '?')}): intelligence "
                     f"{m.get('intelligence')}{_metric_tag(m)}, {_money(m.get('blended_price_per_M'))}, "
                     f"{_speed_text(m)}")
    credits = "".join(f"\n{_md(c)}" for c in res.get("data_credits") or [])
    return ("\n".join(lines) + _speed_footer(res["shortlist"]) + (credits or _credit_lines(res["shortlist"]))
            + _provenance_line(res))


def _fmt_model(res: dict) -> str:
    if not res.get("ok"):
        return f"Iolite: {res.get('error')}"
    if not res["matches"]:
        return "No model matches that name." + _provenance_line(res)
    lines = [f"{_md(m.get('model'))} ({_md(m.get('provider') or '?')}): intelligence "
             f"{m.get('intelligence') if m.get('intelligence') is not None else '?'}{_metric_tag(m)}, "
             f"{_money(m.get('blended_price_per_M'))}, {_speed_text(m)}, "
             f"context {_num(m.get('context_length'), 'tokens')}"
             + (f", arena {m['arena_rating']:g} (Bradley-Terry)" if m.get("arena_rating") is not None else "")
             for m in res["matches"]]
    more = res["total_matches"] - len(res["matches"])
    if more > 0:
        lines.append(f"...and {more} more. Use a longer name.")
    credits = "".join(f"\n{_md(c)}" for c in res.get("data_credits") or [])
    return ("\n".join(lines) + _speed_footer(res["matches"]) + (credits or _credit_lines(res["matches"]))
            + _provenance_line(res))


def _status() -> str:
    path = str(_cfg("catalog_path") or "").strip()
    url = str(_cfg("catalog_url") or "").strip()
    lines = [f"Iolite {VERSION}"]
    if path:
        lines.append(f"Source: catalog_path ({_source_label(path=path)})")
    elif url:
        lines.append(f"Source: catalog_url {_source_label(url=url)}")
    else:
        lines.append("Source: the bundled catalog (no catalog_path or catalog_url set)")
    try:
        rows, _ = _load_base_catalog() if (path or url) else _bundled_catalog()
        n_both = sum(1 for r in rows if decide.is_scorable(r, need_speed=False))
        gen = getattr(rows, "meta", {}).get("generated")
        lines.append(f"Snapshot: {gen or 'date not stated'}; {len(rows)} models, {n_both} with price and score")
        if not (path or url):
            lines.append("Credits: intelligence from Epoch AI's Capabilities Index (CC BY) and the LMArena "
                         "leaderboard dataset (CC BY 4.0); prices from LiteLLM (MIT). Full notices: ATTRIBUTION.md")
    except Exception as exc:
        lines.append(f"Snapshot: could not be read ({_safe_msg(exc)})")
    if _measure_speed_on():
        n = sum(1 for v in _read_speeds().values() if isinstance(v, dict)
                and (netio._num(v.get("n")) or 0) >= SPEED_MIN_SAMPLES)
        lines.append("Speed: measuring tokens per second of your own calls, kept on this machine, never uploaded; "
                     + (f"{n} models measured so far." if n else "none measured yet."))
    else:
        lines.append("Speed: measure_speed is off, so speed is not measured and rows show speed not measured yet.")
    return "\n".join(lines)


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
    register_hook = getattr(ctx, "register_hook", None)
    if callable(register_hook):
        try:
            register_hook("post_api_request", _on_post_api_request)
        except Exception:
            logger.debug("iolite: register_hook failed", exc_info=True)
    register_command = getattr(ctx, "register_command", None)
    if callable(register_command):
        try:
            register_command("iolite", handler=_slash,
                             description="Iolite: shortlist LLMs by intelligence floor, then cost (and speed once measured).",
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
