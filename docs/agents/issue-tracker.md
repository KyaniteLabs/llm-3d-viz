# Issue tracker: Forgejo (REST API)

Issues and PRDs for this repo live as Forgejo issues on `git.kyanitelabs.tech/simon/llm-3d-viz`. There is no supported CLI on this machine (`gh` is GitHub-only; `tea` is not installed), so all operations use the Forgejo REST API via `curl` + `jq`.

- **API base:** `https://git.kyanitelabs.tech/api/v1`
- **Repo path:** `repos/simon/llm-3d-viz` (infer owner/repo from `git remote -v` if this file is reused elsewhere)
- **Auth:** `Authorization: token <TOKEN>` header. The working write-scoped token (`write:issue` verified 2026-08-01) is the Forgejo line in `~/.git-credentials` — extract it with the grep below. **Never print, commit, or paste the token value** into files, issue bodies, or chat. Do NOT use the keychain entries: `forgejo-agent-token` and the osxkeychain `git.kyanitelabs.tech` credential both authenticate but are read-scoped (403 on `write:issue`).
- **User-Agent required:** the Cloudflare edge in front of Forgejo 403s non-browser UAs (error 1010). Send a browser UA on every call.
- The API requires auth for every call, including reads.

Set up once per shell session:

```bash
FORGEJO_TOKEN=$(grep "git.kyanitelabs.tech" "$HOME/.git-credentials" | sed -E 's#https://[^:]*:([^@]*)@.*#\1#' | head -1)
FJ_UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
FJ="https://git.kyanitelabs.tech/api/v1/repos/simon/llm-3d-viz"
fj() { curl -sf -H "Authorization: token $FORGEJO_TOKEN" -H "User-Agent: $FJ_UA" -H "Content-Type: application/json" "$@"; }
```

## Conventions

- **Create an issue**: `fj -X POST "$FJ/issues" -d '{"title":"...","body":"..."}'`
- **Read an issue**: `fj "$FJ/issues/<index>"` and `fj "$FJ/issues/<index>/comments"`
- **List issues**: `fj "$FJ/issues?state=open&type=issues"` — always pass `type=issues` so PRs are excluded.
- **Comment**: `fj -X POST "$FJ/issues/<index>/comments" -d '{"body":"..."}'`
- **Apply / remove labels**: labels are applied by numeric label ID, not name. List IDs with `fj "$FJ/labels"`, create missing ones with `fj -X POST "$FJ/labels" -d '{"name":"needs-triage","color":"#fbca04"}'`, then `fj -X POST "$FJ/issues/<index>/labels" -d '{"labels":[<id>]}'` / `fj -X DELETE "$FJ/issues/<index>/labels/<id>"`.
- **Assign**: `fj -X PATCH "$FJ/issues/<index>" -d '{"assignees":["simon"]}'`
- **Close**: `fj -X PATCH "$FJ/issues/<index>" -d '{"state":"closed"}'`

Forgejo shares one index space across issues and PRs, so a bare `#42` may be either — check the `pull_request` field on the issue object (null = plain issue).

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a Forgejo issue via `POST $FJ/issues`.

## When a skill says "fetch the relevant ticket"

`fj "$FJ/issues/<index>"` plus `fj "$FJ/issues/<index>/comments"`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets. Forgejo has **no sub-issues and no native issue dependencies**, so the fallback representations are canonical here:

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body, with the child tickets as a markdown task list (`- [ ] #<index> title`). Create the label first, then `fj -X POST "$FJ/issues" -d '{"title":"MAP: ...","labels":[<map-label-id>]}'`.
- **Child ticket**: an issue with `Part of #<map-index>` as the first line of its body, added to the map body's task list when created. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every listed blocker is closed. Keep this line in sync — it is the only dependency representation.
- **Frontier query**: list open issues (`?state=open&type=issues`), keep the map's children, drop any with an open issue in their `Blocked by` line or with a non-empty `assignees`; first in map task-list order wins.
- **Claim**: `fj -X PATCH "$FJ/issues/<n>" -d '{"assignees":["simon"]}'` — the session's first write.
- **Resolve**: comment the answer, close the issue, then append a context pointer to the map's Decisions-so-far and check the child off in the map task list (PATCH the map body).
