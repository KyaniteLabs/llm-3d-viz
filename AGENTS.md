# llm-3d-viz

Interactive 3D LLM benchmark visualization (speed × cost × intelligence). Product spec in `SPEC.md`; visual system in `DESIGN-SYSTEM.md`; session resume point in `HANDOFF.md`.

## Agent skills

### Dual-repo (product vs OSS)

- **Product SoT:** Forgejo `simon/llm-3d-viz` only (`origin`). Do not auto-push product main to GitHub.
- **Open source:** separate GitHub `KyaniteLabs/llm-3d-viz` — intentional `oss` remote publish only.
- Policy: `docs/agents/dual-repo.md`.

### Issue tracker

Issues live in Forgejo Issues on `git.kyanitelabs.tech/simon/llm-3d-viz`, managed via the Forgejo REST API. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
