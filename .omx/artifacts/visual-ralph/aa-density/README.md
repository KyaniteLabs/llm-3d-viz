# Visual Ralph — AA-density suite

**Target:** live product at `http://127.0.0.1:4200/` after residual fixes  
**Viewport:** 1440×900  
**Pass threshold:** score ≥ 90

## Capture

```bash
npm run build && npm run preview
# then Playwright screenshot capture (see session) → final-viewport.png
```

## Verdict

See `verdict.json` — **PASS (91)**.

## Notes

Reference = current product baseline after scrape + density UI (not a third-party mock).
