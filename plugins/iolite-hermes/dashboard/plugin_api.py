"""Iolite dashboard API, mounted at ``/api/plugins/iolite/``.

One read-only endpoint, ``GET /landscape``, for the Desktop "model landscape" pane:
the locally measured speeds (tokens per second of your own calls, by catalog slug),
the floor and picks of your latest ``/iolite shortlist``, and which catalog ``/iolite``
is using. It reads two small files from the plugin data directory (``speed.json`` and
``last_shortlist.json``) and the catalog; no network, no secrets, nothing written.

The logic lives in the package's agent half (``__init__.py``), loaded here BY PATH so
there is one implementation and the two surfaces cannot drift (the dashboard loader
imports this file standalone, so sibling package imports do not exist).
"""

from __future__ import annotations

import importlib.util
import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter

log = logging.getLogger(__name__)

router = APIRouter()

_PKG_ROOT = Path(__file__).resolve().parents[1]
_AGENT_MODULE = "iolite_agent_half"
_agent_half: Optional[Any] = None


def _load_agent_half() -> Any:
    global _agent_half
    if _agent_half is None:
        spec = importlib.util.spec_from_file_location(_AGENT_MODULE, _PKG_ROOT / "__init__.py")
        if spec is None or spec.loader is None:
            raise RuntimeError("cannot load the Iolite agent half")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _agent_half = mod
    return _agent_half


@router.get("/landscape")
def landscape() -> dict:
    try:
        return _load_agent_half().landscape_state()
    except Exception:  # never hand a traceback to the pane; it shows "not reachable"
        log.debug("iolite: landscape failed", exc_info=True)
        return {"ok": False, "error": "Iolite could not read its local data"}
