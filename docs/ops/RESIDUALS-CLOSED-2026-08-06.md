# Residuals closed — 2026-08-06

## Closed this pass

| Residual | Resolution |
|----------|------------|
| Catalog via official AA API | Product catalog **302** rows; key local `.env` only |
| `aa-api` provenance validation | Allowed in `src/data/models.ts` |
| Effort-gaps TS after API expand | Types accept `provider` null/string; partial_cards/tiers |
| Expand gap providers | Filled from row data as `"Unknown"` fallback |
| OSS behind product | Rebased: product `bea9984` + Liani → OSS `3220f71` |
| Liani on product | **Verified absent** on Forgejo `main` and live HTML |
| Product deploy | CF Pages redeployed with API catalog |
| Key leak | No key in git tree |

## Explicit non-goals / parked

| Item | Why |
|------|-----|
| AA commercial email | Draft only (`docs/ops/aa-api-contact-draft.md`) — send needs Simon go |
| OSS using Simon’s AA key | Forbidden by Simon — product key only |
| Free API Index-task **time** field | Not in free API schema; cost/task present; time left null |
| Untracked wayfinder/tastecheck PNGs | Local evidence dumps, not product blockers |

## Verify commands

```bash
# Product
git rev-parse origin/main
git ls-tree -r origin/main --name-only | rg simple-decision   # expect empty

# OSS
git fetch oss main
git show oss/main:src/config/edition.ts   # EDITION = "oss"
```
