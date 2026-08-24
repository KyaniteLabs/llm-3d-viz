#!/usr/bin/env bash
# catalog-silence-check.sh — independent watchdog (plan WS1 / audit M7).
#
# Runs hourly via a LaunchAgent (scripts/install-catalog-watchdog.sh) SEPARATE
# from catalog-auto-update's cron so total death of the main pipeline (crash
# loop, removed crontab, flock-style stall) still alerts: fires when no
# successful run (ok:true) appears in the status history for ≥24h.
# Lock-overlap entries are recorded but do not count as success.
# Shares the alert dedup store with the pipeline trap path, so a persistent
# silence condition yields ONE issue, not 24/day. Never exits non-zero — a
# watchdog must not page about itself.
#
# Residual (named in plan): a powered-off host cannot alert locally; the
# Forgejo issue trail carries the last known state for the next visit.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
STATE_DIR="$REPO_ROOT/.cache/catalog-sync"
HISTORY_FILE="$STATE_DIR/status-history.jsonl"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
SILENCE_WINDOW_HOURS="${SILENCE_WINDOW_HOURS:-24}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin${PATH:+:$PATH}"

mkdir -p "$LOG_DIR"
log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" >>"$LOG_DIR/catalog-silence-check.log"; }

# Empty/missing history = fresh install or wiped state: do not fire (test-spec
# WS1); the main pipeline's next run populates it.
if [[ ! -s "$HISTORY_FILE" ]]; then
  log "history empty/missing — no fire"
  exit 0
fi

last_ok_ms="$(node -e "
const fs = require('fs');
const lines = fs.readFileSync(process.argv[1], 'utf8').split('\n').filter(Boolean);
let last = null;
for (const l of lines) {
  try {
    const s = JSON.parse(l);
    if (s.ok === true) last = s.at;
  } catch {}
}
if (!last) { console.log(''); process.exit(0); }
const t = Date.parse(last);
console.log(Number.isFinite(t) ? String(t) : '');
" "$HISTORY_FILE")"

if [[ -z "$last_ok_ms" ]]; then
  log "no ok:true entry in history — firing silence alert"
elif [[ $(( $(date +%s000) - last_ok_ms )) -gt $(( SILENCE_WINDOW_HOURS * 3600000 )) ]]; then
  log "last ok:true older than ${SILENCE_WINDOW_HOURS}h — firing silence alert"
else
  log "healthy (recent ok:true)"
  exit 0
fi

node "$REPO_ROOT/scripts/lib/catalog-alerts.mjs" --silence >>"$LOG_DIR/catalog-silence-check.log" 2>&1 || true
exit 0
