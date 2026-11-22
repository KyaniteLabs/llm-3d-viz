"""The public snapshot builder keeps model identity and dates source-specific."""

import importlib.util
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "build_catalog.py"
SPEC = importlib.util.spec_from_file_location("iolite_catalog_builder", SCRIPT)
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


def test_plus_model_matches_its_own_price():
    def price(rate):
        return {
            "mode": "chat", "litellm_provider": "cohere_chat",
            "input_cost_per_token": rate, "output_cost_per_token": rate,
        }

    prices = BUILDER.PriceIndex({"command-r": price(1e-6), "command-r-plus": price(2e-6)})
    assert BUILDER.norm("Command R+") != BUILDER.norm("Command R")
    assert prices.find("Command R+")[0][0] == "command-r-plus"
    assert prices.find("Command R")[0][0] == "command-r"


def test_release_date_comes_from_a_valid_epoch_row():
    epoch = [
        {"name": f"Fixture {i}", "eci": 55 + i, "org": "Fixture",
         "released": {0: "2026-11-17", 1: "2026-11", 2: "2026-11-31", 3: "2026-11-22"}.get(i, "")}
        for i in range(10)
    ]
    arena = [
        {"name": name, "rating": 1000 + i, "org": "Fixture", "publish_date": "2026-11-19"}
        for i, name in enumerate([r["name"] for r in epoch] + ["Arena only"])
    ]
    catalog, _ = BUILDER.build(epoch, arena, {}, "", "", "2026-11-21")
    dates = {r["model"]: r["release_date"] for r in catalog["models"] if "release_date" in r}
    assert dates == {"Fixture 0": "2026-11-17"}
    fallback = next(r for r in catalog["models"] if r["model"] == "Arena only")
    assert fallback["intelligence"]["metric"] == BUILDER.LMA_METRIC
    assert fallback["arena"]["as_of"] == "2026-11-19"
    assert "release_date" not in fallback


def test_plus_matching_preserves_slugs_and_pairs_the_right_arena_ratings():
    names = ["Command R", "Command R+", *[f"Fixture {i}" for i in range(8)]]
    epoch = [{"name": name, "eci": 55 + i, "org": "Fixture"} for i, name in enumerate(names)]
    arena = [
        {"name": name, "rating": 1000 + i, "org": "Fixture", "publish_date": "2026-11-19"}
        for i, name in enumerate(["command-r", "command-r-plus", *names[2:]])
    ]

    catalog, _ = BUILDER.build(epoch, arena, {}, "", "", "2026-11-21")

    command = [row for row in catalog["models"] if row["model"].startswith("Command R")]
    assert {row["model"]: (row["slug"], row["arena"]["rating"]) for row in command} == {
        "Command R": ("command-r", 1000),
        "Command R+": ("command-r-2", 1001),
    }
