"""One maker, one display name, in the /iolite answers and the Desktop snapshot."""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


providers = _mod("iolite_providers_t", HERE / "providers.py")


def test_spellings_of_one_maker_collapse():
    d = providers.display_provider
    assert d("openai") == d("OpenAI") == "OpenAI"
    assert d("zai") == d("Z.ai (Zhipu AI)") == "Z.ai"
    assert d("google") == d("Google DeepMind") == d("Google DeepMind,Google") == "Google"
    assert d("deepseek") == d("DeepSeek") == d("DeepSeek,Peking University") == "DeepSeek"
    assert d("meta") == d("Meta AI") == "Meta"
    assert d("moonshot") == d("Moonshot") == "Moonshot AI"


def test_unknown_and_empty_values():
    d = providers.display_provider
    assert d("Cerebras Systems") == "Cerebras Systems"
    assert d("Hugging Face,ServiceNow,Nvidia,BigCode") == "Hugging Face"
    assert d("") is None and d("  ") is None and d(None) is None and d(3) is None


def test_bundled_catalog_and_snapshot_have_one_name_per_maker():
    snap = json.loads((HERE / "desktop-src" / "src" / "snapshot.json").read_text())
    names = {m["p"] for m in snap["models"] if m["p"]}
    folded = {}
    for n in names:
        key = n.casefold().replace(" ", "").replace(".", "")
        assert key not in folded, f"{n!r} and {folded.get(key)!r} name one maker"
        folded[key] = n
    for bad in ("openai", "zai", "Z.ai (Zhipu AI)", "Google DeepMind", "google", "deepseek", "anthropic"):
        assert bad not in names
