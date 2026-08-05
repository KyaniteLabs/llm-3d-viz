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
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
mkdir -p "$LOG_DIR"
chmod +x "$JOB"

# Ensure PATH has homebrew node when cron runs with a sparse env
CRON_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

BLOCK=$(cat <<EOF
$MARKER_BEGIN
# Thrice-daily AA catalog refresh → private deploy (llm-3d-viz)
SHELL=/bin/bash
PATH=$CRON_PATH
7 6,14,22 * * * cd "$REPO_ROOT" && /bin/bash "$JOB" >> "$LOG_DIR/catalog-cron.stdout" 2>&1
$MARKER_END
EOF
)

existing="$(crontab -l 2>/dev/null || true)"
# Strip previous block if re-installing
cleaned="$(printf '%s\n' "$existing" | awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" '
  $0==b {skip=1; next}
  $0==e {skip=0; next}
  !skip {print}
')"

{
  printf '%s\n' "$cleaned"
  # blank line separation
  printf '\n%s\n' "$BLOCK"
} | crontab -

echo "Installed llm-3d-viz catalog cron (3×/day: 06:07, 14:07, 22:07 local)."
echo "  job: $JOB"
echo "  log: $LOG_DIR/catalog-auto-update.log"
echo "  cron stdout: $LOG_DIR/catalog-cron.stdout"
echo
echo "Current crontab block:"
crontab -l | sed -n "/$MARKER_BEGIN/,/$MARKER_END/p"
echo
echo "Manual run:  bash $JOB"
echo "Uninstall:   crontab -l | awk '/$MARKER_BEGIN/{s=1;next}/$MARKER_END/{s=0;next}!s' | crontab -"
