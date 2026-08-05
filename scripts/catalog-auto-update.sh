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
#   SKIP_DEPLOY=1 skip rsync/restart (scrape+build only)
#   SKIP_BUILD=1  scrape only
#   FORCE=1       rebuild+deploy even if data hash unchanged
#   LOG_DIR       default: $REPO_ROOT/logs
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DEPLOY_HOST="${DEPLOY_HOST:-vps}"
DEPLOY_DIST="${DEPLOY_DIST:-~/sites/llm-3d-viz/dist}"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
DATA_FILE="$REPO_ROOT/data/models.v0.draft.json"
STATE_DIR="$REPO_ROOT/.cache/catalog-sync"
HASH_FILE="$STATE_DIR/last-data.sha256"
STATUS_FILE="$STATE_DIR/last-status.json"
mkdir -p "$LOG_DIR" "$STATE_DIR"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_DIR/catalog-auto-update.log"; }

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin${PATH:+:$PATH}"
cd "$REPO_ROOT"

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
changed=0
if [[ "$after_hash" != "$before_hash" || "$after_hash" != "$prev_hash" || "${FORCE:-0}" == "1" ]]; then
  changed=1
fi

log "scrape ok rows=$row_count hash=${after_hash:0:12}… changed=$changed"

if [[ "$changed" -eq 0 ]]; then
  log "no catalog change — skip build/deploy"
  printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":true,\"changed\":false,\"rows\":$row_count,\"hash\":\"$after_hash\"}" >"$STATUS_FILE"
  echo "$after_hash" >"$HASH_FILE"
  exit 0
fi

# 2) Build
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  log "building…"
  if ! npm run build >>"$LOG_DIR/catalog-auto-update.log" 2>&1; then
    log "ERROR: build failed"
    printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"build\",\"rows\":$row_count}" >"$STATUS_FILE"
    exit 3
  fi
  log "build ok"
fi

# 3) Deploy private Tailscale instance
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
  # Health check
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 'http://100.92.68.103:4242/' || echo 000)"
  log "health http://100.92.68.103:4242/ → $code"
  if [[ "$code" != "200" ]]; then
    printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":false,\"stage\":\"health\",\"code\":\"$code\",\"rows\":$row_count}" >"$STATUS_FILE"
    exit 6
  fi
fi

echo "$after_hash" >"$HASH_FILE"
printf '%s\n' "{\"at\":\"$(ts)\",\"ok\":true,\"changed\":true,\"rows\":$row_count,\"hash\":\"$after_hash\",\"deployed\":true}" >"$STATUS_FILE"
log "DONE catalog updated and deployed (rows=$row_count)"
exit 0
