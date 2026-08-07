# Draft: Artificial Analysis — redistribution / commercial note

**Status:** draft only — **do not send** until Simon approves.  
**Not legal advice.**

## To
Use the contact form/email on https://artificialanalysis.ai/data-api (or team contact linked from Data API docs).

## Subject
Data API free tier + attribution for public 3D benchmark viz (llm-3d-viz)

## Body (draft)

Hello Artificial Analysis team,

We run an open, MIT-licensed 3D visualization of public LLM benchmarks (speed × cost × intelligence) at [product URL if sharing] and publish a public OSS fork for customizers.

We have **stopped HTML scraping** of artificialanalysis.ai and now use your **official Free Data API**:

- `GET /api/v2/language/models/free` with `x-api-key`
- OpenAPI: https://artificialanalysis.ai/api/v2/openapi
- Visible attribution in the product footer linking to https://artificialanalysis.ai

We also overlay OpenRouter list prices and Arena Elo from the Hugging Face `lmarena-ai/leaderboard-dataset` (CC BY 4.0).

Questions:
1. Is Free-tier API use + footer attribution sufficient for a public non-commercial / OSS demo catalog shipped as static JSON?
2. If we need higher rate limits or broader redistribution for a commercial deployment, what tier/contract should we use?

Happy to share the repo and attribution UI. Thank you for the independent benchmarks and the API.

— Simon / Kyanite Labs

## Operator checklist before send
- [ ] Confirm product URL(s) to include  
- [ ] Confirm commercial vs non-commercial framing  
- [ ] Attach screenshots of attribution footer  
- [ ] Simon explicit send go  
