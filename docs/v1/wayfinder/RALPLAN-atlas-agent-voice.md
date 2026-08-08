# RALPLAN: Atlas navigator agent + voice (talk)

**Date:** 2026-08-07  
**Slug:** atlas-agent-voice  
**Parent:** MAP #128 + atlas-grounded-product-ai.md  
**User:** end-to-end agent + **talk** (STT/TTS); ralplan → to-spec → tickets → implement → ultraqa

## Principles
1. Catalog is ground truth — never invent metrics.
2. Agent = model + tools + environment (viz store + catalog).
3. Viz-first; agent is a dock with speech, not a chat app takeover.
4. Confirm high-impact UI writes (floor, filter wipe).
5. Offline-first tool router; optional LLM upgrade.
6. Talk is first-class: listen + speak with mute and gesture-gated mic.

## Decision drivers
1. Useful for real pick decisions (floor, eligible, cheap/fast).
2. Trust / fail-closed honesty.
3. Ship SPA without new paid infra day one.

## Options
| | Pros | Cons |
|--|------|------|
| **A Offline router + optional LLM + Web Speech (CHOSEN)** | Works offline; real tool loop; talk without keys | Offline NL thinner; Web Speech browser-dependent |
| B Cloud LLM only | Better NL | Dead offline; cost; CORS |
| C Multi-agent swarm | | Overkill for v1 |

## Pre-mortem
1. Invented Index → host-only tools + schema validate.
2. Voice privacy → mic only after gesture; no cloud STT default.
3. Chat buries stage → compact dock; cinema hides.

## Product
**Atlas** navigates catalog and drives Decide. Jobs: set floor, explain out, rank eligible, intents, **speak** and **listen**.

## Architecture
```
Mic/Text → AtlasController → OfflineIntentRouter | optional LlmToolLoop
  → CatalogTools (pure) → AtlasProposal → Confirm → store + TTS
```

### Tools
get_catalog_meta, search_models, get_model, list_eligible, rank_eligible, propose_floor, compare_models. Apply only after host confirm.

### Voice
Web Speech STT + speechSynthesis TTS; push-to-talk; speaker toggle; localStorage mute; reduced-motion shortens speech.

### LLM optional (BYOK, protocol-agnostic)
Browser localStorage config (never `VITE_` product keys):
- **Protocol** = wire format only: `openai` (Chat Completions + tools) or `anthropic` (Messages + tool_use).
- **Not vendor-locked**: any host speaking those formats — OpenAI, Anthropic official, OpenRouter, Ollama, Groq, DeepSeek, vLLM, LiteLLM, self-hosted proxies, etc.
- Fields: `enabled`, `protocol`, `baseUrl`, `apiKey`, `model`, `maxToolRounds`.
- Tool loop uses catalog tools + `finish_turn`; host validates proposal before Apply.
- Missing/incomplete/error → **offline router** (fail soft).

### NUCBox Unsloth (Simon default)
- Preset **NUCBox Unsloth** → base `/api/atlas/llm/v1`, model `SC117/Ornith-1.0-35B-MTP-APEX-GGUF`, key `proxy`.
- Vite same-origin proxy (curl, not Node http) → Tailscale `http://YOUR_NUCBOX_TAILSCALE_IP:8890` with `ATLAS_UNSLOTH_API_KEY` from `.env.local`.
- One-shot: `node scripts/wire-atlas-nucbox.mjs` (ssh pulls agent key; never commits).
- Studio has no CORS; public CF Pages cannot reach NUCBox — local Vite (or a Tailnet host) only.
- If gen canary fails: `ssh nucbox 'systemctl --user restart unsloth-openai-proxy.service'`.

## Acceptance
1. No LLM key: floor 50 + cheapest eligible works.
2. Spoken numbers match tools.
3. Null never fabricated.
4. Mic gesture-gated; TTS muteable.
5. Apply updates stage + URL.
6. Unit + e2e (voice mocked).
7. Live on viz.kyanitelabs.tech.

## Workstreams
W0 tickets · W1 tools+schema · W2 offline agent · W3 UI · W4 voice · W5 LLM · W6 ultraqa+deploy

## ADR
Decision **A′** (revised A after Architect 2026-08-07): offline tools + confirm-apply + honest Web Speech + LLM only later via BYOK/worker — **never product keys in VITE_**.  
Drivers: trust, offline, talk, SPA.  
Apply: `floorSource: "user"` after confirm in v1; TTS speaks host proposal.summary only.  
Speech: disclose browser SpeechRecognition may be vendor-mediated.  
Follow-up: worker LLM proxy; `ai_confirmed` floorSource in Decide v1.1.
