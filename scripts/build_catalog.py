#!/usr/bin/env python3
"""Build plugins/iolite-hermes/data/catalog.json from three openly licensed sources.

    python scripts/build_catalog.py                 # fetch, build, write
    python scripts/build_catalog.py --cache-dir C   # keep raw downloads in C and reuse them

Sources (the only ones; see plugins/iolite-hermes/ATTRIBUTION.md):

  Intelligence  Epoch AI Capabilities Index (ECI), from epoch.ai/data/benchmark_data.zip,
                CC BY. Only epoch_capabilities_index/eci_scores.csv is read. No *_external.csv
                file is opened, and no benchmark question or answer is ever read.
  Intelligence  LMArena Bradley-Terry rating (style-controlled), category "overall", from the
                Hugging Face dataset lmarena-ai/leaderboard-dataset (config text_style_control,
                split latest), CC BY 4.0. Read through the Hugging Face datasets-server rows API
                (pyarrow/duckdb are not required). Used when a model has no ECI value.
  Price         LiteLLM model_prices_and_context_window.json (github.com/BerriAI/litellm), MIT.
                Rows whose `source` names a third-party benchmark aggregator or a mirror, and
                rows served through an aggregator provider, are dropped.
  Speed         None. There is no lawful public source; speed is measured locally by the plugin.

Python standard library only. Network is used only to fetch the three sources above.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parent.parent
PLUGIN = ROOT / "plugins" / "iolite-hermes"
DEFAULT_OUT = PLUGIN / "data" / "catalog.json"
DEFAULT_ATTRIBUTION = PLUGIN / "ATTRIBUTION.md"

SCHEMA = "iolite-catalog/1"
UA = "iolite-catalog-builder/1 (+https://github.com/KyaniteLabs)"

EPOCH_ZIP_URL = "https://epoch.ai/data/benchmark_data.zip"
EPOCH_ECI_MEMBER = "epoch_capabilities_index/eci_scores.csv"  # the only member this script reads
EPOCH_SOURCE_URL = "https://epoch.ai/benchmarks/use-this-data"
CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/"
EPOCH_METRIC = "Epoch Capabilities Index (ECI)"
EPOCH_SOURCE = "Epoch AI, 'Capabilities & benchmarking'"

LMA_DATASET = "lmarena-ai/leaderboard-dataset"
LMA_CONFIG, LMA_SPLIT, LMA_CATEGORY = "text_style_control", "latest", "overall"
LMA_ROWS_API = "https://datasets-server.huggingface.co/rows"
LMA_SOURCE_URL = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset"
LMA_METRIC = "LMArena Bradley-Terry rating (style-controlled)"
LMA_SOURCE = "LMArena (Chatbot Arena) leaderboard — lmarena-ai/leaderboard-dataset"
LMA_CHANGES = "renamed from 'rating'; subset to catalog models"  # the ruling's exact string

LITELLM_REPO = "BerriAI/litellm"
LITELLM_FILE = "model_prices_and_context_window.json"
LITELLM_LICENSE_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/LICENSE"
PRICE_SOURCE = "LiteLLM model_prices_and_context_window.json"
PRICE_SOURCE_URL = f"https://github.com/{LITELLM_REPO}/blob/main/{LITELLM_FILE}"
MIT_URL = "https://opensource.org/license/mit"

# Blend: 3 parts input to 1 part output, a prompt-heavy chat workload.
BLEND_RULE = "blended_per_M = (3 * input_per_M + 1 * output_per_M) / 4"
SCALE_RULE = (
    "intelligence.value = 100 * (x - L) / (H - L), clamped to 0..100, where x is the ECI, or the "
    "LMArena rating mapped onto the ECI scale by a least-squares line fitted on the models that "
    "have both (coefficients in scale.lmarena_to_eci), and L, H are the lowest and highest ECI in "
    "the Epoch file. The raw value and the metric name stay in every row."
)

# Prices come from the model's own vendor first, then from hosts, in this order.
PROVIDER_PRIORITY = [
    "openai", "anthropic", "gemini", "vertex_ai-language-models", "xai", "mistral", "deepseek",
    "moonshot", "zai", "minimax", "dashscope", "cohere_chat", "meta_llama", "together_ai",
    "fireworks_ai", "deepinfra", "nebius", "novita", "bedrock_converse", "bedrock", "azure",
]
MISTRAL_OWN = re.compile(r"^(open-)?(mistral|ministral|codestral|magistral|devstral|pixtral|mixtral|voxtral)", re.I)
EXCLUDED_PROVIDERS = {"openrouter"}  # aggregator data never ships
EXCLUDED_SOURCE_MARKERS = ("artificialanalysis", "tensormesh")  # ruling topic 5

# Explicit pairs where the vendor's price-file id differs from the benchmark name by more than
# punctuation. Keys are normalised names (see norm); values are LiteLLM keys. Each was checked by
# hand: same model, not a neighbour. Anything not listed here is matched exactly or not at all.
ALIASES: Dict[str, str] = {
    # LMArena "DeepSeek-V4.1-Flash-20260910" is the September build that hosts list undated
    # (the 1017 build carries its own date). The vendor-dated row streamlake/...-260910 and
    # Together's undated row both price it at $0.30 in / $1.20 out per million tokens.
    "deepseekv41flash20260910": "together_ai/deepseek-ai/DeepSeek-V4.1-Flash",
}

# Reasoning-effort tags: "X (High)" is the same priced model as "X". Used for PRICE matching only.
EFFORT_TAGS = {"high", "medium", "low", "minimal", "max", "xhigh", "thinking", "reasoning",
               "no thinking", "non-thinking", "nonthinking", "extended thinking", "adaptive"}


# ----------------------------------------------------------------------------- fetching

def http_get(url: str, *, retries: int = 8, timeout: float = 90) -> bytes:
    delay = 2.0
    last: Optional[BaseException] = None
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (429, 500, 502, 503, 504):
                raise
            wait = exc.headers.get("Retry-After") if exc.headers else None
            time.sleep(float(wait) if wait and wait.isdigit() else delay)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            time.sleep(delay)
        delay = min(delay * 2, 30)
    raise RuntimeError(f"giving up on {url.split('?')[0]}: {last}")


def cached(cache: Optional[Path], name: str, fetch) -> bytes:
    if cache is not None:
        p = cache / name
        if p.is_file():
            return p.read_bytes()
    data = fetch()
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / name).write_bytes(data)
    return data


def fetch_epoch(cache: Optional[Path]) -> List[dict]:
    """ECI rows: Model, Display name, eci, Organization, date. Reads one member of the zip."""
    raw = cached(cache, "epoch_benchmark_data.zip", lambda: http_get(EPOCH_ZIP_URL))
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names = z.namelist()
        if EPOCH_ECI_MEMBER not in names or EPOCH_ECI_MEMBER.endswith("_external.csv"):
            raise RuntimeError(f"{EPOCH_ECI_MEMBER} missing from the Epoch zip")
        text = z.read(EPOCH_ECI_MEMBER).decode("utf-8-sig")
    out = []
    for r in csv.DictReader(io.StringIO(text)):
        try:
            eci = float(r["eci"])
        except (KeyError, ValueError):
            continue
        if math.isfinite(eci):
            out.append({"name": (r.get("Display name") or r.get("Model") or "").strip(),
                        "eci": eci, "org": (r.get("Organization") or "").strip(),
                        "released": (r.get("date") or "").strip()})
    return [r for r in out if r["name"]]


def fetch_lmarena(cache: Optional[Path]) -> List[dict]:
    """Overall-category rows of the text_style_control `latest` split."""
    def pull() -> bytes:
        rows: List[dict] = []
        off, total = 0, None
        while total is None or off < total:
            ln = 100 if total is None else min(100, total - off)
            q = urllib.parse.urlencode({"dataset": LMA_DATASET, "config": LMA_CONFIG,
                                        "split": LMA_SPLIT, "offset": off, "length": ln})
            d = json.loads(http_get(f"{LMA_ROWS_API}?{q}"))
            total = d["num_rows_total"]
            rows += [r["row"] for r in d["rows"]]
            off += ln
            time.sleep(0.4)  # the rows API rate-limits bursts
        return json.dumps(rows).encode()
    rows = json.loads(cached(cache, "lmarena_text_style_control_latest.json", pull))
    out = []
    for r in rows:
        if r.get("category") != LMA_CATEGORY:
            continue
        try:
            rating = float(r["rating"])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(rating) and r.get("model_name") and r.get("leaderboard_publish_date"):
            out.append({"name": str(r["model_name"]).strip(), "rating": rating,
                        "org": str(r.get("organization") or "").strip(),
                        "publish_date": str(r["leaderboard_publish_date"])})
    return out


def fetch_litellm(cache: Optional[Path]) -> Tuple[dict, str, str, str]:
    """(price table, commit sha, commit date, MIT licence text)."""
    sha, date = "", ""
    try:
        meta = json.loads(http_get(f"https://api.github.com/repos/{LITELLM_REPO}/commits?"
                                   f"path={LITELLM_FILE}&per_page=1", retries=3))
        sha, date = meta[0]["sha"], meta[0]["commit"]["committer"]["date"][:10]
    except Exception:
        pass  # a missing sha only costs the pin; the data is still the file at main
    ref = sha or "main"
    raw = cached(cache, "litellm_prices.json", lambda: http_get(
        f"https://raw.githubusercontent.com/{LITELLM_REPO}/{ref}/{LITELLM_FILE}"))
    lic = cached(cache, "litellm_LICENSE", lambda: http_get(LITELLM_LICENSE_URL)).decode("utf-8")
    return json.loads(raw), sha, date, lic


# ----------------------------------------------------------------------------- matching

def norm(s: str) -> str:
    """Lowercase ASCII letters and digits only: 'GPT-5.2' and 'gpt-5-2' are both 'gpt52'."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9.]+", "-", s).strip("-")


_DATE_TAIL = re.compile(r"[-@_](?:\d{8}|\d{4}-\d{2}-\d{2})$")


def strip_effort(name: str) -> Tuple[str, Optional[str]]:
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", name)
    if m and m.group(2).strip().lower() in EFFORT_TAGS:
        return m.group(1).strip(), m.group(2).strip()
    return name, None


class PriceIndex:
    """LiteLLM chat rows, indexed by normalised model id, with the ruling's exclusions applied."""

    def __init__(self, table: dict):
        self.dropped_aa_or_tensormesh: List[str] = []
        self.dropped_openrouter: List[str] = []
        self.by_key: Dict[str, List[Tuple[str, dict]]] = {}
        self.by_litellm_key: Dict[str, dict] = {}
        self.usable = 0
        for key, row in table.items():
            if not isinstance(row, dict) or row.get("mode") not in ("chat", "responses"):
                continue
            src = str(row.get("source") or "").lower()
            if any(m in src for m in EXCLUDED_SOURCE_MARKERS):
                self.dropped_aa_or_tensormesh.append(key)
                continue
            if row.get("litellm_provider") in EXCLUDED_PROVIDERS or key.startswith("openrouter/"):
                self.dropped_openrouter.append(key)
                continue
            i, o = row.get("input_cost_per_token"), row.get("output_cost_per_token")
            if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
                       and v >= 0 for v in (i, o)):
                continue
            prov = row.get("litellm_provider")
            if prov not in PROVIDER_PRIORITY:
                continue  # unknown resellers and aggregators never price a model
            if prov == "mistral" and not MISTRAL_OWN.match(key.split("/")[-1]):
                continue  # mistral's host list also carries other labs' models
            self.usable += 1
            self.by_litellm_key[key] = row
            ident = key.split("/")[-1]
            self.by_key.setdefault(norm(ident), []).append((key, row))

    def _rank(self, item: Tuple[str, dict]) -> tuple:
        key, row = item
        prov = row.get("litellm_provider")
        tier = PROVIDER_PRIORITY.index(prov) if prov in PROVIDER_PRIORITY else len(PROVIDER_PRIORITY)
        return (tier, str(prov), len(key), key)

    def find(self, name: str) -> Tuple[Optional[Tuple[str, dict]], str]:
        """(litellm key, row), how it matched. Exact normalised id, an explicit alias, a vendor
        date or -latest suffix on the id, or an effort tag on the name. Nothing fuzzier."""
        candidates: List[Tuple[str, str]] = []  # (normalised key, method)
        n = norm(name)
        if n in ALIASES and ALIASES[n] in self.by_litellm_key:
            return (ALIASES[n], self.by_litellm_key[ALIASES[n]]), "alias"
        candidates.append((n, "exact"))
        base, tag = strip_effort(name)
        if tag:
            b = norm(base)
            if b in ALIASES and ALIASES[b] in self.by_litellm_key:
                return (ALIASES[b], self.by_litellm_key[ALIASES[b]]), f"alias+effort-tag:{tag.lower()}"
            candidates.append((b, f"effort-tag:{tag.lower()}"))
        for k, method in candidates:
            hit = self.by_key.get(k)
            if hit:
                return min(hit, key=self._rank), method
        # dated / -latest ids: 'claude-sonnet-4-5-20250929' for 'Claude Sonnet 4.5'
        for k, method in candidates:
            dated = self.dated_view().get(k)
            if dated:
                return min(dated, key=self._rank), method + "+date-suffix"
        return None, ""

    _dated: Optional[Dict[str, List[Tuple[str, dict]]]] = None

    def dated_view(self) -> Dict[str, List[Tuple[str, dict]]]:
        """Normalised id with its date or -latest suffix removed -> the rows that carry one."""
        if self._dated is None:
            d: Dict[str, List[Tuple[str, dict]]] = {}
            for items in self.by_key.values():
                for key, row in items:
                    ident = key.split("/")[-1]
                    stripped = _DATE_TAIL.sub("", ident)  # dates only; floating -latest ids are never matched
                    if stripped != ident:
                        d.setdefault(norm(stripped), []).append((key, row))
            self._dated = d
        return self._dated


# ----------------------------------------------------------------------------- build

def ols(xs: List[float], ys: List[float]) -> Tuple[float, float]:
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return slope, my - slope * mx


def clamp100(v: float) -> float:
    return max(0.0, min(100.0, v))


def build(epoch: List[dict], lma: List[dict], litellm: dict, litellm_sha: str, litellm_date: str,
          access_date: str) -> Tuple[dict, dict]:
    prices = PriceIndex(litellm)

    # One entry per model: ECI first, then LMArena names that ECI does not cover.
    entries: Dict[str, dict] = {}
    eci_dupes = 0
    for r in epoch:
        k = norm(r["name"])
        if k in entries:
            eci_dupes += 1
            continue
        entries[k] = {"name": r["name"], "org": r["org"], "eci": r["eci"], "lma": None}
    lma_by_key: Dict[str, dict] = {}
    for r in lma:
        k = norm(r["name"])
        if k not in lma_by_key:
            lma_by_key[k] = r
    lma_matched_to_eci = 0
    for k, r in lma_by_key.items():
        if k in entries:
            entries[k]["lma"] = r
            lma_matched_to_eci += 1
        else:
            entries[k] = {"name": r["name"], "org": r["org"], "eci": None, "lma": r}

    # Map LMArena onto the ECI scale where both exist.
    both = [(e["lma"]["rating"], e["eci"]) for e in entries.values() if e["eci"] is not None and e["lma"]]
    if len(both) < 10:
        raise RuntimeError(f"only {len(both)} models have both ECI and LMArena; cannot calibrate")
    slope, icpt = ols([b[0] for b in both], [b[1] for b in both])
    mean_e = sum(b[1] for b in both) / len(both)
    ss_tot = sum((b[1] - mean_e) ** 2 for b in both)
    ss_res = sum((b[1] - (slope * b[0] + icpt)) ** 2 for b in both)
    r2 = 1 - ss_res / ss_tot if ss_tot else 0.0
    eci_all = [r["eci"] for r in epoch]
    lo, hi = min(eci_all), max(eci_all)

    def scale(eci_units: float) -> float:
        return round(clamp100(100 * (eci_units - lo) / (hi - lo)), 1)

    epoch_attr = f"Source: {EPOCH_SOURCE}, epoch.ai/benchmarks/use-this-data (CC BY). Accessed {fmt_date(access_date)}."
    lma_head = f"{LMA_METRIC}. Source: LMArena leaderboard dataset, CC BY 4.0. Modified: renamed from \"rating\"; subset to catalog models"
    lma_attr = f"{lma_head}. {LMA_SOURCE_URL}"

    rows: List[dict] = []
    used_slugs: Dict[str, int] = {}
    method_counts: Dict[str, int] = {}
    for k, e in entries.items():
        slug = slugify(e["name"]) or k
        used_slugs[slug] = used_slugs.get(slug, 0) + 1
        if used_slugs[slug] > 1:
            slug = f"{slug}-{used_slugs[slug]}"
        row: Dict[str, Any] = {"model": e["name"], "provider": e["org"] or None, "slug": slug}
        if e["eci"] is not None:
            row["intelligence"] = {
                "value": scale(e["eci"]), "raw": round(e["eci"], 2), "metric": EPOCH_METRIC,
                "scale": "0-100, see scale in the catalog header", "source": EPOCH_SOURCE,
                "source_url": EPOCH_SOURCE_URL, "license": "CC BY",
                "license_url": CC_BY_URL, "as_of": access_date,
                "changes": "subset to catalog models; rescaled to 0-100",
                "attribution": epoch_attr + " Modified: subset to catalog models; rescaled to 0-100.",
            }
        elif e["lma"]:
            row["intelligence"] = {
                "value": scale(slope * e["lma"]["rating"] + icpt), "raw": round(e["lma"]["rating"], 2),
                "metric": LMA_METRIC, "scale": "0-100, see scale in the catalog header",
                "source": LMA_SOURCE, "source_url": LMA_SOURCE_URL, "license": "CC BY 4.0",
                "license_url": CC_BY_URL, "as_of": e["lma"]["publish_date"],
                "changes": LMA_CHANGES + "; mapped onto the ECI scale and rescaled to 0-100",
                "attribution": f"{lma_head}; mapped onto the ECI scale and rescaled to 0-100. {LMA_SOURCE_URL}",
            }
        if e["lma"]:  # the ruling's arena block, verbatim shape, on every row that carries a rating
            row["arena"] = {
                "rating": round(e["lma"]["rating"], 2), "metric": LMA_METRIC, "source": LMA_SOURCE,
                "source_url": LMA_SOURCE_URL, "license": "CC BY 4.0", "license_url": CC_BY_URL,
                "as_of": e["lma"]["publish_date"], "changes": LMA_CHANGES, "attribution": lma_attr,
            }
        hit, method = prices.find(e["name"])
        if hit:
            lkey, lrow = hit
            i, o = lrow["input_cost_per_token"] * 1e6, lrow["output_cost_per_token"] * 1e6
            row["price"] = {
                "input_per_M": round(i, 6), "output_per_M": round(o, 6),
                "blended_per_M": round((3 * i + o) / 4, 6), "blend_rule": BLEND_RULE,
                "source": PRICE_SOURCE, "source_url": PRICE_SOURCE_URL, "license": "MIT",
                "license_url": MIT_URL, "as_of": litellm_date or access_date,
                "litellm_key": lkey, "litellm_provider": lrow.get("litellm_provider"),
                "row_source": lrow.get("source"), "match": method,
                "attribution": "Price: LiteLLM model_prices_and_context_window.json, MIT licence, "
                               f"Copyright (c) 2023 Berri AI. Row source: {lrow.get('source') or 'not stated'}.",
            }
            ctx = lrow.get("max_input_tokens") or lrow.get("max_tokens")
            if isinstance(ctx, (int, float)) and not isinstance(ctx, bool) and ctx > 0:
                row["context_length"] = int(ctx)
            method_counts[method] = method_counts.get(method, 0) + 1
        rows.append(row)

    rows.sort(key=lambda r: (-(r.get("intelligence") or {}).get("value", -1), r["model"].casefold()))
    both_n = sum(1 for r in rows if r.get("intelligence") and r.get("price"))
    stats = {
        "epoch_eci_rows": len(epoch), "epoch_duplicate_names": eci_dupes,
        "lmarena_overall_rows": len(lma_by_key), "lmarena_matched_to_eci": lma_matched_to_eci,
        "lmarena_only_rows": len(lma_by_key) - lma_matched_to_eci,
        "rows_total": len(rows),
        "rows_with_eci": sum(1 for e in entries.values() if e["eci"] is not None),
        "rows_with_arena": sum(1 for r in rows if r.get("arena")),
        "rows_intelligence_from_eci": sum(1 for r in rows if (r.get("intelligence") or {}).get("metric") == EPOCH_METRIC),
        "rows_intelligence_from_arena": sum(1 for r in rows if (r.get("intelligence") or {}).get("metric") == LMA_METRIC),
        "litellm_chat_rows_usable": prices.usable,
        "litellm_dropped_third_party_source_rows": len(prices.dropped_aa_or_tensormesh),
        "litellm_dropped_aggregator_provider": len(prices.dropped_openrouter),
        "rows_with_price": sum(1 for r in rows if r.get("price")),
        "rows_with_intelligence_and_price": both_n,
        "price_match_methods": method_counts,
        "calibration_pairs": len(both), "calibration_r2": round(r2, 3),
    }
    catalog = {
        "schema": SCHEMA,
        "generated": access_date,
        "generator": "scripts/build_catalog.py",
        "scale": {
            "rule": SCALE_RULE,
            "eci_low": lo, "eci_high": hi,
            "lmarena_to_eci": {"slope": round(slope, 6), "intercept": round(icpt, 4),
                               "fitted_on_models": len(both), "r_squared": round(r2, 3)},
        },
        "blend_rule": BLEND_RULE,
        "speed": ("not included: no lawful public per-model speed source exists. Iolite measures "
                  "tokens per second locally from your own calls; nothing is uploaded."),
        "sources": {
            "intelligence_primary": {
                "name": EPOCH_SOURCE, "metric": EPOCH_METRIC, "url": EPOCH_SOURCE_URL,
                "license": "CC BY", "license_url": CC_BY_URL, "accessed": access_date,
                "files_read": [EPOCH_ECI_MEMBER],
            },
            "intelligence_fallback": {
                "name": "LMArena leaderboard dataset", "metric": LMA_METRIC, "url": LMA_SOURCE_URL,
                "license": "CC BY 4.0", "license_url": CC_BY_URL,
                "config": LMA_CONFIG, "split": LMA_SPLIT, "category": LMA_CATEGORY,
                "leaderboard_publish_date": sorted({r["publish_date"] for r in lma})[-1] if lma else None,
            },
            "price": {
                "name": PRICE_SOURCE, "url": PRICE_SOURCE_URL, "license": "MIT",
                "copyright": "Copyright (c) 2023 Berri AI", "commit": litellm_sha or None,
                "commit_date": litellm_date or None,
            },
        },
        "stats": stats,
        "models": rows,
    }
    return catalog, stats


def fmt_date(iso: str) -> str:
    d = dt.date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%b')} {d.year}"


def attribution_md(cat: dict, litellm_license: str, access_date: str) -> str:
    src = cat["sources"]
    lma_date = src["intelligence_fallback"]["leaderboard_publish_date"]
    st = cat["stats"]
    return f"""# Data attribution and licences

The bundled `data/catalog.json` is a derived work of three openly licensed sources. It was built
by `scripts/build_catalog.py` on {access_date}. Each catalog row repeats the credit that applies to it.

## Intelligence: Epoch AI Capabilities Index (CC BY)

Epoch AI, 'Capabilities & benchmarking'. Published online at epoch.ai. Retrieved from 'https://epoch.ai/benchmarks/use-this-data' [online resource]. Accessed {fmt_date(access_date)}.

Licence: [Creative Commons Attribution]({CC_BY_URL}). Epoch AI's data is free to use, distribute
and reproduce provided the source and authors are credited.

Only `{EPOCH_ECI_MEMBER}` is read, which is Epoch's own data. The `*_external.csv` files keep their
upstream licences and are not used. No benchmark question or answer is included.

Changes: subset to the models in this catalog; each ECI score is rescaled to 0-100 (the original
value is kept as `intelligence.raw`).

## Intelligence fallback: LMArena Bradley-Terry rating (CC BY 4.0)

LMArena (Chatbot Arena) leaderboard, Bradley-Terry rating (style-controlled). Source: the
`lmarena-ai/leaderboard-dataset` dataset on Hugging Face ({LMA_SOURCE_URL}), config
`{LMA_CONFIG}`, split `{LMA_SPLIT}`, category `{LMA_CATEGORY}`, leaderboard publish date {lma_date}.
Licence: [CC BY 4.0]({CC_BY_URL}).

The rating is a Bradley-Terry score, not an Elo rating (LMArena moved from Elo to Bradley-Terry on
9 January 2024; style control became the default on 16 May 2025).

Changes: the field `rating` is renamed `arena.rating`; the data is subset to the models in this
catalog. Where a model has no ECI value, the rating is mapped onto the ECI scale with a least-squares
line fitted on the models that have both, then rescaled to 0-100 (see `scale` in the catalog).

## Price: LiteLLM (MIT)

Prices and context lengths come from `{LITELLM_FILE}` in the BerriAI/litellm repository
(commit {src['price']['commit'] or 'main'}, {src['price']['commit_date'] or access_date}). Each row keeps LiteLLM's own `source` as
`price.row_source`. {st['litellm_dropped_third_party_source_rows']} rows whose source is a third-party benchmark aggregator or mirror, and every row
served by an aggregator or reseller provider outside the allowed list, are dropped.
Blended price: {BLEND_RULE}.

```text
{litellm_license.strip()}
```

## Speed

There is no speed data in this catalog. No public source of per-model hosted-API speed can be
redistributed. Iolite records tokens per second from your own calls, on your own machine, and
never uploads them.

## Not affiliated

Epoch AI, LMArena and BerriAI do not endorse Iolite.
"""


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--attribution", type=Path, default=DEFAULT_ATTRIBUTION)
    ap.add_argument("--cache-dir", type=Path, default=None, help="reuse raw downloads from here")
    ap.add_argument("--access-date", default=dt.date.today().isoformat(), help="YYYY-MM-DD")
    args = ap.parse_args(argv)
    dt.date.fromisoformat(args.access_date)

    print("Epoch ECI ...", file=sys.stderr)
    epoch = fetch_epoch(args.cache_dir)
    print("LMArena ...", file=sys.stderr)
    lma = fetch_lmarena(args.cache_dir)
    print("LiteLLM ...", file=sys.stderr)
    table, sha, date, lic = fetch_litellm(args.cache_dir)
    catalog, stats = build(epoch, lma, table, sha, date, args.access_date)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(catalog, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    args.attribution.write_text(attribution_md(catalog, lic, args.access_date), encoding="utf-8")
    print(json.dumps(stats, indent=1), file=sys.stderr)
    print(f"wrote {args.out} ({stats['rows_total']} rows, "
          f"{stats['rows_with_intelligence_and_price']} with intelligence and price)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
