"""Bring-your-own Artificial Analysis key: the free Data API as an Iolite catalog.

Only used when the operator sets IOLITE_AA_API_KEY. The key is sent only to
https://artificialanalysis.ai: a redirect to any other origin is refused before
it is followed. The key is never logged and never returned in tool output.

Mapping is a port of the observatory's scripts/lib/aa-api.mjs (mapAaApiModel)
and the 7:2:1 blend in scripts/lib/catalog-join.mjs (applyAaDerivedBlend).
"""

from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, List, Optional

ENV_KEY = "IOLITE_AA_API_KEY"
FREE_URL = "https://artificialanalysis.ai/api/v2/language/models/free"
ATTRIBUTION = {
    "text": "Source: Artificial Analysis (artificialanalysis.ai)",
    "url": "https://artificialanalysis.ai/",
}
MAX_PAGES = 20  # matches scripts/lib/aa-api.mjs
MAX_BYTES = 8 * 1024 * 1024


class AaError(RuntimeError):
    """A fetch problem worth showing the operator. Never contains the key."""


def _num(v: Any) -> Optional[float]:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v) if math.isfinite(v) else None


def index_or_none(v: Any) -> Optional[float]:
    """The intelligence index is a 0-100 scale; anything outside it is unknown."""
    n = _num(v)
    return n if n is not None and 0 <= n <= 100 else None


def blended_price(price_in: Optional[float], price_out: Optional[float],
                  price_cache: Optional[float]) -> Optional[float]:
    """AA 7:2:1 cache:input:output. A cache price of 0 or unknown counts as the input price."""
    if price_in is None or price_out is None or price_in < 0 or price_out < 0:
        return None
    cache = price_cache if price_cache is not None and price_cache > 0 else price_in
    return (cache * 7 + price_in * 2 + price_out) / 10


def map_row(m: dict, today: str) -> Optional[dict]:
    """One free-tier model object -> an Iolite catalog row (decide.py's shape)."""
    if not isinstance(m, dict):
        return None
    name = m.get("name") or m.get("slug")
    if not isinstance(name, str) or not name:
        return None
    evals, pricing, perf, v3, creator = (
        m.get(k) if isinstance(m.get(k), dict) else {}
        for k in ("evaluations", "pricing", "performance", "performance_v3", "model_creator")
    )

    # performance (median) goes null on 2026-12-10; performance_v3 (mean) replaces it.
    tps = _num(v3.get("mean_output_tokens_per_second"))
    if tps is None:
        tps = _num(perf.get("median_output_tokens_per_second"))
    ttft_s = _num(v3.get("mean_time_to_first_token_seconds"))
    if ttft_s is None:
        ttft_s = _num(perf.get("median_time_to_first_token_seconds"))

    p_in = _num(pricing.get("price_1m_input_tokens"))
    p_out = _num(pricing.get("price_1m_output_tokens"))
    p_cache = _num(pricing.get("price_1m_cache_hit_tokens"))
    slug = m.get("slug") if isinstance(m.get("slug"), str) else ""
    release = m.get("release_date")
    return {
        "model": name,
        "slug": slug,
        "provider": creator.get("name") if isinstance(creator.get("name"), str) else "Unknown",
        "release_date": release[:10] if isinstance(release, str) else None,
        "data_date": today,
        "tps": tps,
        "ttft": ttft_s * 1000 if ttft_s is not None else None,
        "price_in_per_M": p_in,
        "price_out_per_M": p_out,
        "price_cache_per_M": p_cache,
        "blended_price_per_M": blended_price(p_in, p_out, p_cache),
        "aa_intelligence_index": index_or_none(evals.get("artificial_analysis_intelligence_index")),
        "source": "Artificial Analysis Data API (free tier)",
        "source_url": f"https://artificialanalysis.ai/models/{slug}" if slug else ATTRIBUTION["url"],
    }


Opener = Callable[[urllib.request.Request, float], Any]


def _origin(url: str) -> tuple:
    u = urllib.parse.urlsplit(url)
    return (u.scheme.lower(), (u.hostname or "").lower(), u.port)


class _SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    """Follow a redirect only when it stays on the request's own origin.

    Anything else (another host, an https -> http downgrade, a non-http scheme)
    is refused before a request is built, so headers such as x-api-key never
    leave the origin the operator configured."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urljoin(req.full_url, newurl)
        if _origin(target) != _origin(req.full_url):
            raise urllib.error.HTTPError(req.full_url, code, "redirect to another origin refused",
                                         headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, target)


def open_same_origin(req: urllib.request.Request, timeout: float):
    """urlopen with redirects confined to the request's origin. Proxies from the
    standard *_proxy environment variables still apply, as with any urllib call."""
    return urllib.request.build_opener(_SameOriginRedirect).open(req, timeout=timeout)


_default_open = open_same_origin

CHUNK = 64 * 1024


def read_capped(resp: Any, deadline: float, cap: int, what: str) -> bytes:
    """Read at most cap + 1 bytes, giving up once the monotonic deadline passes.

    A server that answers late or drips its body slowly is refused, so the
    timeout covers the whole response, not just each socket read."""
    chunks: List[bytes] = []
    size = 0
    while True:
        if time.monotonic() > deadline:
            raise TimeoutError(f"{what} did not finish answering in time")
        chunk = resp.read(min(CHUNK, cap + 1 - size))
        if not chunk:
            break
        chunks.append(chunk)
        size += len(chunk)
        if size > cap:
            break
    if time.monotonic() > deadline:
        raise TimeoutError(f"{what} did not finish answering in time")
    return b"".join(chunks)


def check_key(key: str) -> None:
    """A key with whitespace or control characters inside is a paste error. Refuse it
    here, because http.client would echo the whole header value in its exception."""
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in key):
        raise AaError(f"{ENV_KEY} contains a space, newline or control character; paste the key again")


def fetch_rows(key: str, today: str, timeout: float, user_agent: str,
               opener: Opener = _default_open) -> List[dict]:
    """Walk the free endpoint's pages and map every row. One request per page.

    `timeout` bounds the whole walk, not just each socket read. A catalog that
    still says has_more after MAX_PAGES is an error, never a silent cut, and a
    model seen on two pages is kept once (the scripts/lib/aa-api.mjs contract).
    """
    if not key:
        raise AaError(f"{ENV_KEY} is empty")
    check_key(key)
    deadline = time.monotonic() + timeout
    rows: List[dict] = []
    seen = set()
    for page in range(1, MAX_PAGES + 1):
        left = deadline - time.monotonic()
        if left <= 0:
            raise AaError(f"Artificial Analysis did not answer within {timeout:g}s")
        req = urllib.request.Request(
            f"{FREE_URL}?page={page}",
            headers={"x-api-key": key, "Accept": "application/json", "User-Agent": user_agent},
        )
        try:
            with opener(req, left) as resp:
                body = read_capped(resp, deadline, MAX_BYTES, "Artificial Analysis")
        except TimeoutError:
            raise AaError(f"Artificial Analysis did not answer within {timeout:g}s") from None
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                raise AaError("Artificial Analysis rejected the key (401). Check IOLITE_AA_API_KEY.") from None
            if exc.code == 429:
                wait = exc.headers.get("Retry-After") if exc.headers else None
                hint = f" Retry after {wait}s." if wait else ""
                raise AaError("Artificial Analysis rate limit or daily quota reached (free tier: 100 requests a day)." + hint) from None
            if 300 <= exc.code < 400:
                raise AaError("Artificial Analysis redirected off artificialanalysis.ai; refused, key not sent") from None
            raise AaError(f"Artificial Analysis returned HTTP {exc.code}") from None
        except urllib.error.URLError as exc:
            reason = exc.reason if isinstance(exc.reason, str) else exc.reason.__class__.__name__
            raise AaError(f"Could not reach Artificial Analysis: {reason}".replace(key, "[key]")) from None
        except OSError as exc:
            raise AaError(f"Could not reach Artificial Analysis: {exc.__class__.__name__}") from None
        except Exception as exc:
            # Never str(exc): http.client puts header values, the key included, in messages.
            raise AaError(f"Artificial Analysis request failed ({exc.__class__.__name__})") from None
        if len(body) > MAX_BYTES:
            raise AaError("Artificial Analysis response exceeds 8 MB")
        try:
            payload = json.loads(body)
        except ValueError:
            raise AaError("Artificial Analysis sent a response that is not JSON") from None
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            raise AaError("Unexpected Artificial Analysis response: no 'data' list")
        for r in (map_row(m, today) for m in data):
            if r is None:
                continue
            ident = r["slug"] or r["model"]
            if ident in seen:
                continue
            seen.add(ident)
            rows.append(r)
        pagination = payload.get("pagination") if isinstance(payload, dict) else None
        if not (isinstance(pagination, dict) and pagination.get("has_more")):
            return rows
    raise AaError(f"Artificial Analysis still had more pages after {MAX_PAGES}; refusing a partial catalog")
