# Map — Code quality → customizable → dual-host open source

| Field | Value |
|-------|--------|
| **Status** | charted · **blocked by** S+ map #147 (W0–W5 #148–#153) |
| **Forgejo map** | #154 |
| **Depends on** | [MAP-s-plus-observatory-quality](./MAP-s-plus-observatory-quality.md) complete + glance-first color law |
| **Goal** | High-quality codebase; easy for others to fork and customize; public OSS on **Forgejo + GitHub** |
| **Charted** | 2026-08-06 |

---

## Critical path (do not reorder)

```
  [S+ visual train #147 W0–W5]
           │  product looks/works at S+ · glanceable lab color
           ▼
  Q0  Scope freeze + OSS intent lock (this map)
           │
           ▼
  Q1  /improve-codebase-architecture  (whole repo)
           │  deep modules, seams, less tangle
           ▼
  Q2  /oh-my-claudecode:ultraqa  (whole project)
           │  tests · build · lint · typecheck · adversarial QA loop
           ▼
  Q3  Customizability seams (forker-facing)
           │  config / themes / catalog / encoding hooks
           ▼
  Q4  Dual-host OSS publish (Forgejo public + GitHub mirror)
           │  LICENSE · public README · Core/Orbit split · no secrets
           ▼
  Q5  OSS verify (cold clone both remotes · fork smoke)
```

**Order is fixed:** visual S+ → architecture improve → ultraqa → customize → open source.  
Do **not** open-source first (dirty/private/incomplete product face). Do **not** customize before architecture (wrong seams).

---

## Why this order

| Step | Why before next |
|------|-----------------|
| S+ visual | Public demo is the product; OSS without instrument quality is a demo dump |
| Architecture | Customizability needs clean seams; OSS without structure = unforkable |
| UltraQA | Ship-grade green suite before strangers run `npm test` |
| Customizable | Explicit forker surface before documenting “bring your own” |
| FJ + GH | Dual public face last; dual-host-public-face discipline |

---

## Child tickets (local; file to Forgejo when S+ map closes or owner says chart now)

### Q0 — Scope freeze + OSS intent
- **Blocked by:** S+ W5 SHIP (or explicit partial allow)
- **Accept:** LICENSE choice locked (recommend **MIT** or **Apache-2.0**); public product name; “Core vs Orbit” list (what ships public vs private ops); no secrets in history plan; customize surface list approved (below)

### Q1 — Improve codebase architecture (whole project)
- **Blocked by:** Q0  
- **Skill:** improve-codebase-architecture / improve-existing-system style: audit → ranked gaps → ship top structural fixes  
- **Accept:** Written architecture note (modules + seams); paint/encoding already one seam; console/Decide/data/catalog boundaries clear; no god-file regressions; short “how to extend” for agents  
- **Out:** New product features; redesign visual system again

### Q2 — UltraQA whole project
- **Blocked by:** Q1  
- **Skill:** `oh-my-claudecode:ultraqa` (tests + build + lint/typecheck as applicable + fix loop)  
- **Accept:** `npm test` green; `npm run build` green; `npm run test:render` green or documented skip matrix; no open type errors; ultraqa evidence logged; fail-stop if same failure 3×  

### Q3 — Easy customizability (forker-facing)
- **Blocked by:** Q2  
- **Accept — at least these customization points documented + implemented as config/seams (not fork-the-whole-app):**

| Customize | Mechanism (proposed) |
|-----------|----------------------|
| **Catalog / models data** | Replace/extend JSON catalog path; schema documented |
| **Lab brand colors** | Map/config file for `LAB_BRANDS` (or equivalent) |
| **Axis metrics / defaults** | Config for default weights, age filter, multi-effort |
| **Design tokens** | CSS variables / tokens entry for ink/filament/fonts |
| **Encoding toggles** | Documented query flags + config for heat/openness/brand density |
| **App title / copy shell** | Single branding strings module (not hardcoded “Model Observatory” everywhere) |
| **Decide defaults** | Floor default, bias default as config |

- **Glance law preserved:** custom lab colors still always-on at a glance; no hover-required identity  
- **Docs:** `docs/forkers/` or CONTRIBUTING section: “Make your own observatory in N steps”  
- **Out:** Plugin marketplace, multi-tenant SaaS, runtime theme store

### Q4 — Dual-host open source (Forgejo + GitHub)
- **Blocked by:** Q3  
- **Accept:**
  - LICENSE file at root  
  - Public-safe README (no private deploy secrets, no Tailscale IPs, no personal tokens)  
  - Forgejo repo visibility **public** (or public OSS repo path if split)  
  - GitHub remote/mirror under org/user Simon chooses (e.g. KyaniteLabs)  
  - dual-host-public-face: FJ canonical, GH mirror; README identical job  
  - `.gitignore` + secret scan clean; private ops (deploy keys, Worker tokens, personal status) **Orbit** not in public tree  
  - CONTRIBUTING + minimal CODE_OF_CONDUCT optional  
  - `npm install && npm test && npm run build` works from clean clone on both hosts  

### Q5 — Cold-clone verify
- **Blocked by:** Q4  
- **Accept:** Fresh clone FJ + GH; install/build/test; forker checklist (swap catalog + one brand color + retitle) works in &lt;30 min documented  

---

## Decisions so far

1. OSS is **desired** on **both** Forgejo and GitHub  
2. **Customizable** is a first-class forker job, not “read the source and hope”  
3. **Architecture improve + ultraqa** run on the **whole project** after S+ visual, **before** OSS  
4. S+ map #147 remains the current execution frontier; this map is **next train**  
5. Glanceable lab color law remains in force for customize path  

## Fog / later

- npm package extract of encoding math  
- Theme marketplace  
- Multi-language i18n  
- Paid hosted multi-tenant  

## Frontier

**Now:** finish / execute S+ #147 (W0–W5).  
**Next map frontier after S+:** Q0 on this map.
