#!/usr/bin/env bash
# install-catalog-watchdog.sh — run the catalog silence watchdog via launchd.
#
# Prevention for the 2026-08-16 cron kill: the hourly silence-check used to be
# a SECOND crontab entry, so whatever rewrote the crontab (external tooling)
# killed the watchdog together with the pipeline it watches — a watchdog that
# shares the failure mode it monitors is not a watchdog. A LaunchAgent lives
# in ~/Library/LaunchAgents and survives crontab rewrites.
#
# Idempotent. Also strips any legacy silence block from the crontab (the
# cron copy and this agent must not both run — harmless, but redundant).
# Uninstall: launchctl bootout gui/$(id -u)/"$LABEL" && rm "$PLIST"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="tech.kyanitelabs.llm-3d-viz.silence"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"
chmod +x "$REPO_ROOT/scripts/catalog-silence-check.sh"

# Migrate: remove the legacy cron silence block if present (best-effort).
SILENCE_MARKER_BEGIN="# BEGIN llm-3d-viz-catalog-silence"
SILENCE_MARKER_END="# END llm-3d-viz-catalog-silence"
if crontab -l 2>/dev/null | grep -q "$SILENCE_MARKER_BEGIN"; then
  crontab -l | awk -v b="$SILENCE_MARKER_BEGIN" -v e="$SILENCE_MARKER_END" '
    $0==b {skip=1; next}
    $0==e {skip=0; next}
    !skip {print}
  ' | crontab -
  echo "Removed legacy cron silence block (watchdog now runs via launchd)."
fi

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${REPO_ROOT}/scripts/catalog-silence-check.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${REPO_ROOT}</string>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/catalog-watchdog.launchd.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/catalog-watchdog.launchd.log</string>
</dict>
</plist>
EOF

UID_N="$(id -u)"
# bootstrap is the modern interface; fall back to load for older launchctl.
if ! launchctl bootout "gui/${UID_N}/${LABEL}" 2>/dev/null; then
  launchctl unload "$PLIST" 2>/dev/null || true
fi
if launchctl bootstrap "gui/${UID_N}" "$PLIST" 2>/dev/null; then
  echo "Bootstrapped ${LABEL} (hourly, RunAtLoad)."
else
  launchctl load -w "$PLIST"
  echo "Loaded ${LABEL} via legacy interface (hourly, RunAtLoad)."
fi
echo "  agent: $PLIST"
echo "  heartbeat: $LOG_DIR/catalog-silence-check.log (a gap >1h means the agent died — check morning reports)"
