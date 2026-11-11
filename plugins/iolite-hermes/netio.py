"""Small stdlib helpers for reading a catalog: number hygiene, same-origin
redirects and a response reader that honours a whole-response deadline."""

from __future__ import annotations

import math
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, List, Optional


def _num(v: Any) -> Optional[float]:
    """A finite float, or None. Huge integers (which cannot become a float) are None."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    try:
        f = float(v)
    except OverflowError:
        return None
    return f if math.isfinite(f) else None


def index_or_none(v: Any) -> Optional[float]:
    """The intelligence score is a 0-100 scale; anything outside it is unknown."""
    n = _num(v)
    return n if n is not None and 0 <= n <= 100 else None


def _origin(url: str) -> tuple:
    u = urllib.parse.urlsplit(url)
    return (u.scheme.lower(), (u.hostname or "").lower(), u.port)


class _SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    """Follow a redirect only when it stays on the request's own origin, and only
    while the whole-request deadline has time left. Anything else (another host,
    an https -> http downgrade, a non-http scheme) is refused before a request is
    built. Each hop is given only the time that remains."""

    max_redirections = 3

    def __init__(self, deadline: Optional[float] = None):
        super().__init__()
        self.deadline = deadline

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urljoin(req.full_url, newurl)
        if _origin(target) != _origin(req.full_url):
            raise urllib.error.HTTPError(req.full_url, code, "redirect to another origin refused",
                                         headers, fp)
        if self.deadline is not None:
            left = self.deadline - time.monotonic()
            if left <= 0:
                raise TimeoutError("redirect chain ran out of time")
            req.timeout = left  # urllib reuses the old request's timeout for the next hop
        return super().redirect_request(req, fp, code, msg, headers, target)


def open_same_origin(req: urllib.request.Request, timeout: float):
    """urlopen with redirects confined to the request's origin and to `timeout`
    seconds in total for the redirect chain. Proxies from the standard *_proxy
    environment variables still apply, as with any urllib call."""
    deadline = time.monotonic() + timeout
    return urllib.request.build_opener(_SameOriginRedirect(deadline)).open(req, timeout=timeout)


CHUNK = 64 * 1024


def _bound_socket(resp: Any, left: float) -> None:
    """Shrink the socket's timeout to the time left, so a blocked recv wakes at
    the deadline. Best effort: a response without a real socket (a test double)
    has nothing to bound."""
    try:
        resp.fp.raw._sock.settimeout(max(left, 0.001))
    except AttributeError:
        pass


def read_capped(resp: Any, deadline: float, cap: int, what: str) -> bytes:
    """Read at most cap + 1 bytes, giving up once the monotonic deadline passes.

    HTTPResponse.read(n) keeps reading until it has n bytes, so a server that
    drips its body would hold it past any check made between calls. This uses
    read1 (one underlying read per call) and bounds the socket timeout to the
    time left before each one, so the timeout covers the whole response."""
    read = getattr(resp, "read1", None) or resp.read
    chunks: List[bytes] = []
    size = 0
    while True:
        left = deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError(f"{what} did not finish answering in time")
        _bound_socket(resp, left)
        chunk = read(min(CHUNK, cap + 1 - size))
        if not chunk:
            break
        chunks.append(chunk)
        size += len(chunk)
        if size > cap:
            break
    if time.monotonic() > deadline:
        raise TimeoutError(f"{what} did not finish answering in time")
    return b"".join(chunks)
