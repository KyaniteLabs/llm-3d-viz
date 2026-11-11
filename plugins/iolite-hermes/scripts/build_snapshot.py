#!/usr/bin/env python3
"""Build the compact snapshot the Desktop landscape pane ships inside its bundle.

    python scripts/build_snapshot.py            # rewrite desktop-src/src/snapshot.json
    python scripts/build_snapshot.py --check    # exit 1 when the file is out of date

Input is data/catalog.json (the same bundled catalog /iolite answers from); output is a
small JSON file with only what the pane plots: name, provider, slug, intelligence and its
source tag, blended price per million tokens, context window and the LMArena rating.
Rows with no price or no score are not plotted; they are counted, never invented.
Speed is not in the snapshot: there is no lawful public speed source, so the pane reads
speed measured on the user's own machine at run time.

The output is deterministic (stable order, no timestamps), so --check is a plain diff.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

HERE = Path(__file__).resolve().parent
CATALOG = HERE.parent / "data" / "catalog.json"
OUT = HERE.parent / "desktop-src" / "src" / "snapshot.json"

# Intelligence source tags. 0 = Epoch Capabilities Index; 1 = LMArena Bradley-Terry rating
# mapped onto the ECI scale (the catalog's own fallback; see ATTRIBUTION.md).
ECI = "ECI"
ARENA = "LMArena"


def _finite(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


def source_tag(metric: Any) -> str:
    m = str(metric or "").casefold()
    if "epoch" in m or "eci" in m:
        return ECI
    if "lmarena" in m or "bradley" in m:
        return ARENA
    return "other"


def build(catalog: Dict[str, Any]) -> Dict[str, Any]:
    models: List[Dict[str, Any]] = []
    rows = catalog.get("models") or []
    for r in rows:
        if not isinstance(r, dict):
            continue
        intel = r.get("intelligence") if isinstance(r.get("intelligence"), dict) else {}
        price = r.get("price") if isinstance(r.get("price"), dict) else {}
        arena = r.get("arena") if isinstance(r.get("arena"), dict) else {}
        score, cost = _finite(intel.get("value")), _finite(price.get("blended_per_M"))
        if score is None or cost is None or cost < 0 or not 0 <= score <= 100:
            continue
        name = r.get("model")
        if not isinstance(name, str) or not name.strip():
            continue
        row: Dict[str, Any] = {
            "n": name.strip(),
            "p": str(r.get("provider") or "").strip(),
            "s": str(r.get("slug") or name).strip(),
            "i": round(score, 2),
            "t": source_tag(intel.get("metric")),
            "c": round(cost, 6),
        }
        ctx = _finite(r.get("context_length"))
        if ctx is not None and ctx > 0:
            row["x"] = int(ctx)
        rating = _finite(arena.get("rating"))
        if rating is not None:
            row["a"] = round(rating, 1)
        models.append(row)
    models.sort(key=lambda m: (m["c"], -m["i"], m["n"].casefold(), m["s"]))
    src = catalog.get("sources") or {}
    stats = catalog.get("stats") or {}
    return {
        "schema": "iolite-landscape-snapshot/1",
        "generated": catalog.get("generated"),
        "total": len(rows),
        "plotted": len(models),
        "unplotted": len(rows) - len(models),
        "free": sum(1 for m in models if m["c"] == 0),
        "blend": catalog.get("blend_rule"),
        "eci": {"low": (catalog.get("scale") or {}).get("eci_low"), "high": (catalog.get("scale") or {}).get("eci_high")},
        "credits": [
            f"Intelligence: {(src.get('intelligence_primary') or {}).get('name', 'Epoch AI')}, Epoch Capabilities Index "
            f"({(src.get('intelligence_primary') or {}).get('license', 'CC BY')}), accessed {(src.get('intelligence_primary') or {}).get('accessed', '')}. "
            "Rescaled to 0-100.",
            "Fallback intelligence: LMArena Bradley-Terry rating, style-controlled "
            f"({(src.get('intelligence_fallback') or {}).get('license', 'CC BY 4.0')}), published "
            f"{(src.get('intelligence_fallback') or {}).get('leaderboard_publish_date', '')}. Bradley-Terry, not Elo; "
            "mapped onto the ECI scale where a model has no ECI.",
            f"Prices and context: LiteLLM model_prices_and_context_window.json ({(src.get('price') or {}).get('license', 'MIT')}), "
            f"{(src.get('price') or {}).get('copyright', '')}. Blended price = (3 x input + 1 x output) / 4.",
        ],
        "stats": {"with_arena": stats.get("rows_with_arena"), "with_eci": stats.get("rows_with_eci")},
        "models": models,
    }


def render(snapshot: Dict[str, Any]) -> str:
    return json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"), sort_keys=False) + "\n"


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="fail when the snapshot file is out of date")
    ap.add_argument("--catalog", type=Path, default=CATALOG)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args(argv)
    text = render(build(json.loads(args.catalog.read_text(encoding="utf-8"))))
    if args.check:
        have = args.out.read_text(encoding="utf-8") if args.out.exists() else None
        if have != text:
            print(f"{args.out} is out of date; run scripts/build_snapshot.py", file=sys.stderr)
            return 1
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out.name}: {len(text)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
