"""Python port of src/lib/decide.ts (intelligence floor -> cost x speed Pareto -> bias shortlist).

Kept line-for-line close to the TypeScript so a reviewer can diff the two by eye.
tests/test_decide.py asserts this module against tests/fixtures/decide-golden.json,
which the repo's vitest suite regenerates from decide.ts itself.

Models are plain dicts with the catalog field names: model, tps,
blended_price_per_M, aa_intelligence_index, data_date.
"""

from __future__ import annotations

import decimal
import functools
import hashlib
import math
import unicodedata
from typing import Any, Dict, Iterable, List, Optional

Model = Dict[str, Any]

# src/config/fork-defaults.ts -> decideFloor / decideBias
DEFAULT_INTELLIGENCE_FLOOR = 50.0
DEFAULT_COST_SPEED_BIAS = 0.0
DEFAULT_SHORTLIST_N = 3

_JS_EPSILON = 2.0 ** -52  # Number.EPSILON


def _finite(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _js_round(x: float) -> float:
    """Math.round: half rounds toward +infinity (Python's round() is banker's)."""
    return float(math.floor(x + 0.5))


def round_to(value: float, decimals: int) -> float:
    """src/lib/pareto.ts roundTo."""
    factor = 10 ** decimals
    scaled = (value + _JS_EPSILON * max(1.0, abs(value))) * factor
    if not math.isfinite(scaled):  # JS gives Infinity here; Python's floor would raise
        return value
    return _js_round(scaled) / factor


def is_scorable(m: Model) -> bool:
    """src/data/models.ts isScorable: tps, price and index all finite and >= 0."""
    for key in ("tps", "blended_price_per_M", "aa_intelligence_index"):
        v = m.get(key)
        if v is None or not _finite(v) or v < 0:
            return False
    return True


def clamp_floor(n: Any) -> float:
    if not _finite(n):
        return DEFAULT_INTELLIGENCE_FLOOR
    return min(100.0, max(0.0, float(n)))


def clamp_bias(n: Any) -> float:
    if not _finite(n):
        return 0.0
    return min(1.0, max(-1.0, float(n)))


def is_pick_eligible(m: Model, floor: float) -> bool:
    if not is_scorable(m):
        return False
    return m["aa_intelligence_index"] >= clamp_floor(floor)


def filter_pick_eligible(models: Iterable[Model], floor: float) -> List[Model]:
    return [m for m in models if is_pick_eligible(m, floor)]


def dominates_cost_speed(a: Model, b: Model) -> bool:
    if not is_scorable(a) or not is_scorable(b):
        return False
    a_cost = round_to(a["blended_price_per_M"], 2)
    b_cost = round_to(b["blended_price_per_M"], 2)
    a_speed = round_to(a["tps"], 1)
    b_speed = round_to(b["tps"], 1)
    at_least = a_cost <= b_cost and a_speed >= b_speed
    strict = a_cost < b_cost or a_speed > b_speed
    return at_least and strict


def cost_speed_pareto(models: Iterable[Model]) -> List[Model]:
    """The models no other model dominates (dominates_cost_speed), in input order.

    Same answer as the TypeScript's pairwise check, in O(n log n): sort by rounded
    cost, then a model survives only if it is the fastest at its cost and strictly
    faster than everything cheaper. tests/test_decide.py checks it against the
    pairwise definition on random catalogs."""
    valid = [m for m in models if is_scorable(m)]
    keyed = [(round_to(m["blended_price_per_M"], 2), round_to(m["tps"], 1), i) for i, m in enumerate(valid)]
    keyed.sort(key=lambda k: k[0])
    keep = set()
    best_cheaper = -math.inf
    j = 0
    while j < len(keyed):
        k = j
        while k < len(keyed) and keyed[k][0] == keyed[j][0]:
            k += 1
        top = max(speed for _, speed, _ in keyed[j:k])
        if top > best_cheaper:
            keep.update(i for _, speed, i in keyed[j:k] if speed == top)
        best_cheaper = max(best_cheaper, top)
        j = k
    return [m for i, m in enumerate(valid) if i in keep]


# ICU root collation order of printable ASCII punctuation, as Node's
# localeCompare sorts it. Punctuation is not ignored: it sorts before digits,
# and digits before letters.
_PUNCT_ORDER = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"
_PUNCT_RANK = {ch: i for i, ch in enumerate(_PUNCT_ORDER)}


def _primary(ch: str) -> tuple:
    if ch in _PUNCT_RANK:
        return (0, _PUNCT_RANK[ch])
    if ch.isdigit():
        return (1, unicodedata.digit(ch, 0))
    if "a" <= ch <= "z":
        return (2, ord(ch))
    return (3, ord(ch))


def _locale_key(name: str):
    """String.prototype.localeCompare (ICU root collation), for the names a catalog uses.

    Three levels, as ICU compares them: base characters (punctuation, then digits,
    then letters, ignoring case and accents), then accents, then case with
    lowercase first. Checked against Node in tests/test_decide.py. Only reached
    when score, price and speed all tie, and in the snapshot ordering."""
    primary, secondary, tertiary = [], [], []
    for ch in name:
        parts = unicodedata.normalize("NFD", ch)
        base, marks = parts[0], parts[1:]
        for b in base.casefold():
            primary.append(_primary(b))
        secondary.append(marks)
        tertiary.append(0 if base == base.casefold() else 1)
    return (tuple(primary), tuple(secondary), tuple(tertiary))


def rank_pareto_by_bias(pareto: List[Model], bias: float) -> List[Model]:
    b = clamp_bias(bias)
    if not pareto:
        return []
    costs = [m["blended_price_per_M"] for m in pareto]
    speeds = [m["tps"] for m in pareto]
    min_c, max_c = min(costs), max(costs)
    min_s, max_s = min(speeds), max(speeds)
    span_c = (max_c - min_c) or 1
    span_s = (max_s - min_s) or 1
    w_fast = (b + 1) / 2
    w_cheap = 1 - w_fast

    scored = []
    for m in pareto:
        cheap = (max_c - m["blended_price_per_M"]) / span_c
        fast = (m["tps"] - min_s) / span_s
        scored.append((w_cheap * cheap + w_fast * fast, m))

    def cmp(x, y):
        (sx, mx), (sy, my) = x, y
        for d in (sy - sx,
                  mx["blended_price_per_M"] - my["blended_price_per_M"],
                  my["tps"] - mx["tps"]):
            if d:
                return -1 if d < 0 else 1
        kx, ky = _locale_key(mx["model"]), _locale_key(my["model"])
        return (kx > ky) - (kx < ky)

    scored.sort(key=functools.cmp_to_key(cmp))
    return [m for _, m in scored]


def shortlist_from_decide(models: List[Model], floor: float, bias: float,
                          n: Any = DEFAULT_SHORTLIST_N) -> Dict[str, List[Model]]:
    safe_n = math.floor(n) if _finite(n) and n > 0 else DEFAULT_SHORTLIST_N
    eligible = filter_pick_eligible(models, floor)
    pareto = cost_speed_pareto(eligible)
    ranked = rank_pareto_by_bias(pareto, bias)
    return {"eligible": eligible, "pareto": pareto, "shortlist": ranked[:safe_n]}


def floor_from_anchor(models: Iterable[Model], anchor: str) -> Optional[float]:
    row = next((m for m in models if m.get("model") == anchor), None)
    if row is None:
        return None
    idx = row.get("aa_intelligence_index")
    if idx is None or not _finite(idx) or idx < 0 or idx > 100:
        return None
    return float(idx)


def _js_num(v: Any) -> str:
    """Number -> string the way JS template/join coerces it."""
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    f = float(v)
    if not math.isfinite(f):
        return "NaN" if f != f else ("Infinity" if f > 0 else "-Infinity")
    if f == 0:
        return "0"
    # ECMAScript Number::toString: the shortest round-trip digits (Python's repr
    # finds the same ones), laid out with JS's rules for when to use an exponent.
    sign = "-" if f < 0 else ""
    _, digits_t, exp = decimal.Decimal(repr(abs(f))).normalize().as_tuple()
    digits = "".join(map(str, digits_t))
    k = len(digits)
    n = exp + k  # value = 0.digits x 10^n
    if k <= n <= 21:
        out = digits + "0" * (n - k)
    elif 0 < n <= 21:
        out = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        out = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        mant = digits if k == 1 else digits[0] + "." + digits[1:]
        out = f"{mant}e{'+' if e >= 0 else '-'}{abs(e)}"
    return sign + out


def catalog_snapshot_payload(models: Iterable[Model]) -> str:
    rows = [
        "|".join(_js_num(m.get(k)) for k in
                 ("model", "aa_intelligence_index", "tps", "blended_price_per_M", "data_date"))
        for m in models
    ]
    rows.sort(key=_locale_key)
    return "\n".join(rows)


def catalog_snapshot_id(models: Iterable[Model]) -> str:
    digest = hashlib.sha256(catalog_snapshot_payload(models).encode("utf-8")).hexdigest()
    return f"cat_{digest[:16]}"


def bias_reason(bias: float) -> str:
    b = clamp_bias(bias)
    return "bias_cheap" if b < -0.25 else "bias_fast" if b > 0.25 else "bias_balanced"
