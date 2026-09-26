# Atlas voice: free open-source path

**No money, no API key.** Atlas speaks with **Kokoro-82M** (Apache-2.0) via `kokoro-js` + Transformers.js — neural TTS **in your browser**.

| Engine | Cost | Quality | Notes |
|--------|------|---------|--------|
| **Kokoro `am_michael`** (default) | Free OSS | Neural male | First speak downloads model (~80MB); then cached |
| Web Speech male picker | Free | OS-dependent | Fallback if Kokoro fails |
| OpenAI worker TTS | Paid | Best | Optional only if you set a key — not required |

## User experience

1. Open **ATLAS**, leave **Talk** on.
2. First command may pause while the model loads (one-time).
3. After that, replies use local neural male audio — no cloud bill.

## Why not OpenAI by default

You asked for free open source. Paid neural APIs need keys and budget. Kokoro is the 2026 browser-native OSS answer.
