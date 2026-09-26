# Decision: OSS dual-host + customizability after quality train

**Map:** [MAP-oss-custom-quality.md](./MAP-oss-custom-quality.md)  
**Date:** 2026-08-06  
**Status:** proposed · locks when Q0 closes  

## Owner asks
1. Open-source version on **Forgejo and GitHub** so others can make their own versions  
2. **Easily customizable** (same reason)  
3. When product train is done, **before** OSS: run **improve-codebase-architecture** + **ultraqa** on the whole project  

## Locked sequence
`S+ visual (#147) → architecture improve → ultraqa → customizability seams → dual-host OSS → cold-clone verify`

## Dual-host
- **Forgejo** remains canonical developer remote for Simon  
- **GitHub** public mirror for discovery/forks  
- Public face discipline: no secrets, no private VPS/Tailscale as required path, LICENSE + clean README  

## Customizability minimum (Q3)
Catalog, lab colors, tokens, defaults/weights, branding strings, documented encoding flags — config/seams + forker guide, not a full plugin platform.

## License
Recommend **MIT** (simple forks) unless legal wants Apache-2.0; lock at Q0.

## Non-goals before OSS
Shipping private deploy automation as required for forks; personal agent ops; Cloudflare credit runbooks as product core.
