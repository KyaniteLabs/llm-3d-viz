#!/usr/bin/env bash
# catalog-auto-update.sh — scrape AA → (if changed) build → deploy private VPS
#
# Intended to run ≥3×/day via cron (see scripts/install-catalog-cron.sh).
# Honest scrape only: models appear when Artificial Analysis publishes them.
#
# Env:
#   REPO_ROOT     default: parent of this scripts/ dir
#   DEPLOY_HOST   default: vps  (ssh host with dist + docker)
#   DEPLOY_DIST   default: ~/sites/llm-3d-viz/dist
#   HEALTH_URL    optional private origin health check (e.g. http://127.0.0.1:4242/)
#   SKIP_DEPLOY=1 skip rsync/restart (scrape+build only)
#   SKIP_BUILD=1  scrape only
#   FORCE=1       rebuild+deploy even if data hash unchanged
#   LOG_DIR       default: $REPO_ROOT/logs
#   ARCHIVE_TAG_ENABLED=1  after DONE: tag the deployed state (data/YYYY-MM-DD-HHMM)
#                          + archive raw snapshots (W5/#191). Default on; 0 disables.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_HOST="${DEPLOY_HOST:-vps}"
DEPLOY_DIST="${DEPLOY_DIST:-~/sites/llm-3d-viz/dist}"
HEALTH_URL="${HEALTH_URL:-}"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
DATA_FILE="$REPO_ROOT/data/models.v0.draft.json"
STATE_DIR="$REPO_ROOT/.cache/catalog-sync"
HASH_FILE="$STATE_DIR/last-data.sha256"
STATUS_FILE="$STATE_DIR/last-status.json"
HISTORY_FILE="$STATE_DIR/status-history.jsonl"
mkdir -p "$LOG_DIR" "$STATE_DIR"

# Plan WS1 (audit H5/M7): durable status history + failure alerting. Every exit
# path writes STATUS_FILE before exiting; this trap appends it to the history
# (consumed by scripts/catalog-silence-check.sh) and fires one aggregated
# failure alert via the shared dedup store — lock overlap is NOT a failure.
on_exit() {
  rc=$?
  if [[ -f "$STATUS_FILE" ]]; then
    cat "$STATUS_FILE" >>"$HISTORY_FILE" 2>/dev/null || true
  fi
  if [[ $rc -ne 0 ]]; then
    stage="$(node -e "try{const s=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(s.stage||'unknown')}catch{console.log('unknown')}" "$STATUS_FILE" 2>/dev/null || echo unknown)"
    if [[ "$stage" != "lock" ]]; then
      log "ALERT: firing pipeline-failure alert (stage=$stage rc=$rc)"
      node "$REPO_ROOT/scripts/lib/catalog-alerts.mjs" --failure "$stage" >>"$LOG_DIR/catalog-auto-update.log" 2>&1 || true
    fi
  fi
}
# Single EXIT trap: on_exit (history + failure alert) then lock release.
# Bash keeps only one handler per signal — a second `trap ... EXIT` elsewhere
# would silently clobber this one (caught by the ultragoal final review).
trap 'on_exit; lock_cleanup' EXIT

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_DIR/catalog-auto-update.log"; }

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin${PATH:+:$PATH}"
# Load operator secrets (AA_API_KEY, optional CF token) so cron runs succeed
# without an interactive shell. .env / .env.local are gitignored.
for __envf in "$REPO_ROOT/.env" "$REPO_ROOT/.env.local"; do
  [ -f "$__envf" ] && set -a && . "$__envf" && set +a
done
unset __envf
cd "$REPO_ROOT"

# D10: Non-blocking singleton lock — record overlap instead of stacking writers.
# flock when available (Linux); macOS cron has no flock, so fall back to a
# mkdir lock with a PID staleness check. A missing flock previously exited 127,
# which read as "overlap" and silently stalled every cron run for days.
LOCK_FILE="$STATE_DIR/catalog-auto-update.lock"
LOCK_DIR="$STATE_DIR/catalog-auto-update.lockd"
LOCK_HELD_DIR=""
lock_cleanup() { [[ -n "$LOCK_HELD_DIR" ]] && rm -rf "$LOCK_HELD_DIR"; }
acquire_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK_FILE"
    flock -n 9
    return $?
  fi
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    LOCK_HELD_DIR="$LOCK_DIR"
    printf '%s\n' "$$" >"$LOCK_DIR/pid"
    return 0
  fi
  local pid
  pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
    log "stale lock (pid ${pid:-?} gone) — reclaiming"
    rm -rf "$LOCK_DIR"
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      LOCK_HELD_DIR="$LOCK_DIR"
      printf '%s\n' "$$" >"$LOCK_DIR/pid"
      return 0
    fi
  fi
  return 1
}
if ! acquire_lock; then
  log "ABORT: another catalog-auto-update is already running (overlap)"
  printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"lock\",\"reason\":\"overlap\"}" >"$STATUS_FILE"
  exit 10
fi

if ! command -v node >/dev/null 2>&1; then
  log "ERROR: node not on PATH"
  exit 1
fi

log "START catalog auto-update (root=$REPO_ROOT host=$DEPLOY_HOST)"

before_hash=""
if [[ -f "$DATA_FILE" ]]; then
  before_hash="$(shasum -a 256 "$DATA_FILE" | awk '{print $1}')"
fi
prev_hash=""
[[ -f "$HASH_FILE" ]] && prev_hash="$(cat "$HASH_FILE")"

# 1) Scrape Artificial Analysis public leaderboard
if ! node --experimental-strip-types "$REPO_ROOT/scripts/expand-aa-multi-effort.mjs" >>"$LOG_DIR/catalog-auto-update.log" 2>&1; then
  log "ERROR: AA scrape failed"
  printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"scrape\"}" >"$STATUS_FILE"
  exit 2
fi

after_hash="$(shasum -a 256 "$DATA_FILE" | awk '{print $1}')"
row_count="$(node -e "const m=require('./data/models.v0.draft.json'); console.log(Array.isArray(m)?m.length:(m.models||[]).length)")"
# Empty-catalog guard: AA field-rename or empty 200 → empty draft.
# Abort before build/deploy if rows drop below a sane floor.
MIN_ROWS="${MIN_ROWS:-50}"
# D09: Compare shrink against last-deployed-rows (not last scrape) so staged
# degradation + downstream failure cannot bypass the guard.
DEPLOYED_ROWS_FILE="$STATE_DIR/last-deployed-rows"
deployed_rows=""
[[ -f "$DEPLOYED_ROWS_FILE" ]] && deployed_rows="$(cat "$DEPLOYED_ROWS_FILE")"
if [[ "$row_count" -lt "$MIN_ROWS" ]]; then
  log "ABORT: row_count=$row_count below MIN_ROWS=$MIN_ROWS — likely AA schema change or empty scrape"
  printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"guard\",\"rows\":$row_count,\"reason\":\"below_min\"}" >"$STATUS_FILE"
  exit 8
fi
if [[ -n "$deployed_rows" && "$deployed_rows" -gt 0 ]]; then
  shrink_pct=$(( (deployed_rows - row_count) * 100 / deployed_rows ))
  if [[ "$shrink_pct" -gt 50 ]]; then
    log "ABORT: row_count=$row_count dropped ${shrink_pct}% from last deployed $deployed_rows — likely scrape failure"
    printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"guard\",\"rows\":$row_count,\"prev\":$deployed_rows,\"shrink\":$shrink_pct}" >"$STATUS_FILE"
    exit 8
  fi
fi
# Track scrape count separately for diagnostics (not used for shrink gate).
echo "$row_count" >"$STATE_DIR/last-rows"
changed=0
if [[ "$after_hash" != "$before_hash" || "$after_hash" != "$prev_hash" || "${FORCE:-0}" == "1" ]]; then
  changed=1
fi

log "scrape ok rows=$row_count hash=${after_hash:0:12}… changed=$changed"

# Coverage report every successful scrape (null honesty; no invented fields).
if ! node "$REPO_ROOT/scripts/catalog-coverage-report.mjs" --out "$LOG_DIR/catalog-coverage.txt" >>"$LOG_DIR/catalog-auto-update.log" 2>&1; then
  log "WARN: catalog coverage report failed (non-fatal)"
else
  log "coverage → $LOG_DIR/catalog-coverage.txt"
fi

# Plan WS1: evaluate diff + canary alerts after every successful scrape.
# Aggregated per-run payload, signature-deduped; alerting never fails the run.
if ! node "$REPO_ROOT/scripts/lib/catalog-alerts.mjs" --evaluate >>"$LOG_DIR/catalog-auto-update.log" 2>&1; then
  log "WARN: alert evaluate failed (non-fatal)"
else
  log "alerts evaluated (diff + canary)"
fi

if [[ "$changed" -eq 0 ]]; then
  log "no catalog change — skip build/deploy"
  printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":true,\"changed\":false,\"rows\":$row_count,\"hash\":\"$after_hash\"}" >"$STATUS_FILE"
  echo "$after_hash" >"$HASH_FILE"
  exit 0
fi

# D08: SKIP_BUILD=1 means scrape only — exit before any deployment and do NOT
# advance the deployed hash. The data has been refreshed but the running build
# is stale; the next non-SKIP_BUILD run will build+deploy.
if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  log "SKIP_BUILD=1 — scrape only, skipping build and deploy (deployed:false)"
  printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":true,\"changed\":true,\"scraped\":true,\"deployed\":false,\"rows\":$row_count,\"hash\":\"$after_hash\"}" >"$STATUS_FILE"
  exit 0
fi

# 2) Build
log "building…"
if ! npm run build >>"$LOG_DIR/catalog-auto-update.log" 2>&1; then
  log "ERROR: build failed"
  printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"build\",\"rows\":$row_count}" >"$STATUS_FILE"
  exit 3
fi
log "build ok"

# 3) Deploy private Tailscale instance
# D11: Strict allow-list — only permit the dedicated deploy path for rsync --delete.
if [[ "${SKIP_DEPLOY:-0}" != "1" ]]; then
case "$DEPLOY_DIST" in
  */sites/llm-3d-viz/dist|~/*/sites/llm-3d-viz/dist)
    : ;; # allowed — dedicated deploy path
  *)
    log "ABORT: DEPLOY_DIST='$DEPLOY_DIST' is not the required '*/sites/llm-3d-viz/dist' path for rsync --delete"
    exit 9 ;;
esac
fi
if [[ "${SKIP_DEPLOY:-0}" != "1" ]]; then
  log "deploy → $DEPLOY_HOST:$DEPLOY_DIST"
  # Expand ~ on remote via ssh shell
  if ! rsync -az --delete "$REPO_ROOT/dist/" "${DEPLOY_HOST}:${DEPLOY_DIST}/" >>"$LOG_DIR/catalog-auto-update.log" 2>&1; then
    log "ERROR: rsync deploy failed"
    printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"rsync\",\"rows\":$row_count}" >"$STATUS_FILE"
    exit 4
  fi
  if ! ssh "$DEPLOY_HOST" 'docker restart llm-3d-viz' >>"$LOG_DIR/catalog-auto-update.log" 2>&1; then
    log "ERROR: docker restart failed"
    printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"restart\",\"rows\":$row_count}" >"$STATUS_FILE"
    exit 5
  fi
  # Optional health check (set HEALTH_URL in operator env — never hardcode private IPs here)
  if [[ -n "$HEALTH_URL" ]]; then
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$HEALTH_URL" || echo 000)"
    log "health $HEALTH_URL → $code"
    if [[ "$code" != "200" ]]; then
      printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"health\",\"code\":\"$code\",\"rows\":$row_count}" >"$STATUS_FILE"
      exit 6
    fi
  else
    log "health skipped (set HEALTH_URL to enable)"
  fi
fi

# 4) Deploy to Cloudflare Pages — public publish. Double-gated: requires
#    DEPLOY_PAGES=1 in addition to CLOUDFLARE_API_TOKEN + PAGES_PROJECT.
#    This preserves the approval-gated public-publish policy (see `npm run deploy:pages`).
if [[ "${DEPLOY_PAGES:-0}" == "1" && "${SKIP_PAGES:-0}" != "1" && -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${PAGES_PROJECT:-}" ]]; then
  log "deploy pages → $PAGES_PROJECT (branch=${PAGES_BRANCH:-main})"
  if ! npx wrangler pages deploy "$REPO_ROOT/dist" \
        --project-name="$PAGES_PROJECT" --branch="${PAGES_BRANCH:-main}" --commit-dirty=true \
        >>"$LOG_DIR/catalog-auto-update.log" 2>&1; then
    log "ERROR: pages deploy failed"
    printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"pages\",\"rows\":$row_count}" >"$STATUS_FILE"
    exit 7
  fi
  log "pages deploy ok"
else
  log "pages deploy skipped (set DEPLOY_PAGES=1 + CLOUDFLARE_API_TOKEN + PAGES_PROJECT in .env to enable)"
fi

# D08+D09: Advance deployed hash and last-deployed-rows ONLY after successful
# build + deploy + health. This is the point where the catalog is truly live.
echo "$after_hash" >"$HASH_FILE"
echo "$row_count" >"$DEPLOYED_ROWS_FILE"
printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":true,\"changed\":true,\"rows\":$row_count,\"hash\":\"$after_hash\",\"deployed\":true}" >"$STATUS_FILE"
log "DONE catalog updated and deployed (rows=$row_count)"

# W5 / ticket #191 — dataset release tag + pruned raw snapshot archive.
# Runs ONLY after the DONE status write above: env-gated (ARCHIVE_TAG_ENABLED,
# default on) and strictly non-fatal — a tag/archive problem must never unwind
# a successful deploy. NOTE: this block deliberately installs NO trap of its
# own; the single EXIT trap near the top stays the only one.
if [[ "${ARCHIVE_TAG_ENABLED:-1}" == "1" ]]; then
  if ! bash "$SCRIPT_DIR/catalog-archive-tag.sh" >>"$LOG_DIR/catalog-auto-update.log" 2>&1; then
    log "WARN: catalog-archive-tag failed (non-fatal)"
  else
    log "catalog-archive-tag ok"
  fi
fi
exit 0
