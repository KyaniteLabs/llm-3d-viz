"""One display name per model maker.

The catalog merges Epoch AI, LMArena and LiteLLM, which spell makers differently
("openai" and "OpenAI", "zai" and "Z.ai (Zhipu AI)"). Both the /iolite answers and the
Desktop snapshot show provider names through display_provider(), so one maker never
appears twice. Unknown names pass through unchanged; multi-maker credits keep their
first-listed maker, mapped.
"""
from __future__ import annotations

from typing import Any, Optional

_CANON = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google",
    "google deepmind": "Google",
    "alibaba": "Alibaba",
    "meta": "Meta",
    "meta ai": "Meta",
    "xai": "xAI",
    "mistral": "Mistral AI",
    "mistral ai": "Mistral AI",
    "deepseek": "DeepSeek",
    "zai": "Z.ai",
    "z.ai": "Z.ai",
    "z.ai (zhipu ai)": "Z.ai",
    "zhipu": "Z.ai",
    "nvidia": "NVIDIA",
    "tencent": "Tencent",
    "amazon": "Amazon",
    "ibm": "IBM",
    "xiaomi": "Xiaomi",
    "allenai": "Ai2",
    "moonshot": "Moonshot AI",
    "moonshot ai": "Moonshot AI",
    "microsoft": "Microsoft",
    "microsoft research": "Microsoft",
    "stepfun": "StepFun",
    "minimax": "MiniMax",
    "cohere": "Cohere",
    "baidu": "Baidu",
    "meituan": "Meituan",
    "upstage": "Upstage",
    "ant-group": "Ant Group",
    "inception-ai": "Inception",
    "bytedance": "ByteDance",
    "reflection": "Reflection AI",
    "thinky": "Thinking Machines",
    "thinking machines": "Thinking Machines",
    "nousresearch": "Nous Research",
    "nous research": "Nous Research",
}


def display_provider(raw: Any) -> Optional[str]:
    """The canonical display name for a catalog provider value, or None when empty."""
    if not isinstance(raw, str):
        return None
    name = raw.strip()
    if not name:
        return None
    first = name.split(",")[0].strip() if "," in name else name
    return _CANON.get(first.casefold(), _CANON.get(name.casefold(), first if "," in name else name))
