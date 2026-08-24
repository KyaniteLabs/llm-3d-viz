#!/usr/bin/env bash
# Install a thrice-daily catalog refresh cron job on this machine.
#
# Default schedule (local time): 06:07, 14:07, 22:07 — ≥3 checks/day.
# Uses scripts/catalog-auto-update.sh (scrape → build-if-changed → private VPS).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JOB="$REPO_ROOT/scripts/catalog-auto-update.sh"
MARKER_BEGIN="# BEGIN llm-3d-viz-catalog-sync"
MARKER_END="# END llm-3d-viz-catalog-sync"
# Legacy: the silence watchdog used to be a second cron block. It now runs as a
# LaunchAgent (survives crontab rewrites — the 2026-08-16 kill took both cron
# blocks together). We still strip any leftover silence block on reinstall.
SILENCE_MARKER_BEGIN="# BEGIN llm-3d-viz-catalog-silence"
SILENCE_MARKER_END="# END llm-3d-viz-catalog-silence"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
mkdir -p "$LOG_DIR"
chmod +x "$JOB"

# Ensure PATH has homebrew node when cron runs with a sparse env
CRON_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

BLOCK=$(cat <<EOF
$MARKER_BEGIN
# Thrice-daily AA catalog refresh → private VPS deploy + (optional) Cloudflare Pages
SHELL=/bin/bash
PATH=$CRON_PATH
7 6,14,22 * * * cd "$REPO_ROOT" && /bin/bash "$JOB" >> "$LOG_DIR/catalog-cron.stdout" 2>&1
$MARKER_END
EOF
)

existing="$(crontab -l 2>/dev/null || true)"
# Strip previous blocks if re-installing (incl. legacy silence block — see above)
cleaned="$(printf '%s\n' "$existing" | awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" -v sb="$SILENCE_MARKER_BEGIN" -v se="$SILENCE_MARKER_END" '
  $0==b {skip=1; next}
  $0==e {skip=0; next}
  $0==sb {skip=1; next}
  $0==se {skip=0; next}
  !skip {print}
')"

{
  printf '%s\n' "$cleaned"
  # blank line separation
  printf '\n%s\n' "$BLOCK"
} | crontab -

echo "Installed llm-3d-viz catalog cron (3×/day: 06:07, 14:07, 22:07 local)."
if printf '%s\n' "$existing" | grep -q "$SILENCE_MARKER_BEGIN"; then
  echo "NOTE: legacy silence cron block was removed — watchdog lives in launchd now."
fi
echo "  job: $JOB"
echo "  log: $LOG_DIR/catalog-auto-update.log"
echo "  cron stdout: $LOG_DIR/catalog-cron.stdout"
echo "  watchdog: bash $SCRIPT_DIR/install-catalog-watchdog.sh (launchd — run if not yet installed)"
echo
echo "Current crontab block:"
crontab -l | sed -n "/$MARKER_BEGIN/,/$MARKER_END/p"
echo
echo "Manual run:  bash $JOB"
echo "Uninstall:   crontab -l | awk '/$MARKER_BEGIN/{s=1;next}/$MARKER_END/{s=0;next}!s' | crontab -"
