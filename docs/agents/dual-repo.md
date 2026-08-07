# Dual-repo model (product vs open source)

**Not dual-host mirror.** Two different roles:

| Repo | Host | Role | Who pushes |
|------|------|------|------------|
| **Product (yours)** | Forgejo `simon/llm-3d-viz` | Simon’s instrument, catalog ops, deploy, issues | This workspace → `origin` only |
| **Open source** | GitHub `KyaniteLabs/llm-3d-viz` | Public MIT fork surface for customizers | **Intentional** publish only (`oss` remote) |

## Product workspace rules

1. **Source of truth:** `origin` = `https://git.kyanitelabs.tech/simon/llm-3d-viz.git`
2. **Do not** auto-push every product merge to GitHub.
3. Optional remote name: `oss` → GitHub (publish when Simon asks to refresh the public OSS tree).
4. Issues/PRs for product work: Forgejo only (`docs/agents/issue-tracker.md`).

## Open source repo rules

1. MIT, forker guide (`docs/forkers/README.md`), branding/catalog seams.
2. No requirement that product `main` and OSS `main` stay byte-identical after every PR.
3. When publishing OSS: scrub secrets, private deploy status, private IPs; keep attribution footer.
4. Public description should say **open-source observatory**, not “private product mirror.”

## Publish OSS (operator)

```bash
# From product checkout, after Simon go:
git fetch origin
git push oss origin/main:main   # intentional; not post-commit default
```

Or cut a release branch / tag and push that only.

## What this is not

- Not two forever-diverged products with zero shared code (you can still publish product→OSS when you want).
- Not “Forgejo public + GitHub public same live mirror.”

## Liani / simple decision UX

Lives **only** on the OSS GitHub tree (`oss/public` → `oss` remote `main`).

- Product Forgejo `main`: `edition = "product"` — no simple-decision panel, no cute labels.
- OSS: `edition = "oss"` mounts `src/ui/simple-decision.ts`.
- **Never merge `oss/public` into product `main`.** Rebase OSS onto product when publishing instead.
