#!/usr/bin/env bash
# catalog-archive-tag.sh — dataset release tags + pruned raw snapshot archive
# (plan W5 / ticket #191 — reproducibility).
#
# Invoked by scripts/catalog-auto-update.sh AFTER its DONE status write
# (env-gated ARCHIVE_TAG_ENABLED=1, default on; non-fatal there), or run
# standalone after a deploy. This script installs NO traps of its own.
#
# Steps:
#   1. TAG       create `data/<YYYY-MM-DD-HHMM>` (UTC) at HEAD for the deployed
#                state. GUARD: a non-empty `git status --porcelain -- data/`
#                means HEAD may not contain the deployed bytes → fire the
#                standard failure alert (catalog-alerts.mjs --failure
#                tag_dirty_tree, deduped, best-effort) and SKIP tag creation.
#                Commit data/ changes, then rerun. Tag-prune and archive still
#                run: neither depends on git state.
#   2. TAG PRUNE delete `data/*` release tags older than TAG_MAX_AGE_DAYS (30)
#                EXCEPT the latest KEEP_RECENT_TAGS (12) — rollup anchors that
#                survive age so the longitudinal record is capped, not erased.
#   3. ARCHIVE   tar data/aa-api-snapshot.json + data/openrouter-snapshot.json
#                into archive/raw/<YYYY-MM-DD-HHMM>.tgz (gitignored) and prune
#                archive files older than ARCHIVE_MAX_AGE_DAYS (30, full — no
#                keep-N).
#
# All decisions (name derivation, prune selection) come from the pure helpers
# in scripts/lib/archive-tag.mjs — this script only performs the mutations.
#
# Env:
#   REPO_ROOT             default: parent of this scripts/ dir
#   DRY_RUN=1             print planned actions only — no tag, no delete, no tar
#   TAG_MAX_AGE_DAYS      default: 30
#   KEEP_RECENT_TAGS      default: 12
#   ARCHIVE_MAX_AGE_DAYS  default: 30
#   LOG_DIR               default: $REPO_ROOT/logs
#
# Exit codes: 0 ok · 3 dirty-tree guard tripped (tag skipped) · 1 hard error.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
HELPER="$REPO_ROOT/scripts/lib/archive-tag.mjs"
ALERTS="$REPO_ROOT/scripts/lib/catalog-alerts.mjs"
TAG_MAX_AGE_DAYS="${TAG_MAX_AGE_DAYS:-30}"
KEEP_RECENT_TAGS="${KEEP_RECENT_TAGS:-12}"
ARCHIVE_MAX_AGE_DAYS="${ARCHIVE_MAX_AGE_DAYS:-30}"
DRY_RUN="${DRY_RUN:-0}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin${PATH:+:$PATH}"

mkdir -p "$LOG_DIR"
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_DIR/catalog-archive-tag.log"; }

command -v node >/dev/null 2>&1 || { log "ERROR: node not on PATH"; exit 1; }
command -v git >/dev/null 2>&1 || { log "ERROR: git not on PATH"; exit 1; }

rc=0

# --- 1) TAG: deployed state → data/YYYY-MM-DD-HHMM ---------------------------
if ! dirty="$(git -C "$REPO_ROOT" status --porcelain -- data/)"; then
  log "ERROR: git status failed — cannot verify data/ cleanliness"
  exit 1
fi
if [[ -n "$dirty" ]]; then
  # Do NOT tag a tree that may not contain the deployed bytes. Standard alert
  # path — shared dedup store, best-effort, never fatal to the pipeline.
  log "ABORT tag: data/ working tree dirty — commit data/ changes, then rerun (tag-prune + archive continue)"
  if [[ "$DRY_RUN" == "1" ]]; then
    log "[dry-run] would fire alert: catalog-alerts.mjs --failure tag_dirty_tree"
  else
    node "$ALERTS" --failure tag_dirty_tree >>"$LOG_DIR/catalog-archive-tag.log" 2>&1 || true
  fi
  rc=3
else
  if ! tag_name="$(node "$HELPER" tag-name)"; then
    log "WARN: tag-name derivation failed"
    tag_name=""
    rc=1
  fi
  if [[ -z "$tag_name" ]]; then
    : # warned above
  elif git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/$tag_name" >/dev/null 2>&1; then
    log "tag $tag_name already exists — skip creation"
  elif [[ "$DRY_RUN" == "1" ]]; then
    log "[dry-run] would create tag $tag_name at HEAD"
  else
    git -C "$REPO_ROOT" tag -a "$tag_name" -m "dataset release $tag_name (catalog-auto-update)"
    log "tagged $tag_name"
  fi
fi

# --- 2) TAG PRUNE: >30d data/* tags, latest KEEP_RECENT_TAGS survive ---------
prune_list=""
if ! prune_list="$(node "$HELPER" tag-prune --max-age-days "$TAG_MAX_AGE_DAYS" --keep-recent "$KEEP_RECENT_TAGS")"; then
  log "WARN: tag-prune planning failed — skipping tag prune"
  prune_list=""
  [[ $rc -eq 0 ]] && rc=1
fi
if [[ -z "$prune_list" ]]; then
  log "no data/* tags to prune (max-age=${TAG_MAX_AGE_DAYS}d keep-recent=$KEEP_RECENT_TAGS)"
else
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    if [[ "$DRY_RUN" == "1" ]]; then
      log "[dry-run] would delete tag $t"
    elif git -C "$REPO_ROOT" tag -d "$t" >/dev/null 2>&1; then
      log "pruned tag $t"
    else
      log "WARN: failed to delete tag $t"
    fi
  done <<<"$prune_list"
fi

# --- 3) ARCHIVE: raw snapshots → archive/raw/<ts>.tgz, prune >30d -------------
archive_dir="$REPO_ROOT/archive/raw"
[[ "$DRY_RUN" == "1" ]] || mkdir -p "$archive_dir"
archive_name=""
if ! archive_name="$(node "$HELPER" archive-name)"; then
  log "WARN: archive-name derivation failed"
  archive_name=""
  [[ $rc -eq 0 ]] && rc=1
fi
archive_path="$archive_dir/$archive_name"
snapshots=()
for f in aa-api-snapshot.json openrouter-snapshot.json; do
  [[ -f "$REPO_ROOT/data/$f" ]] && snapshots+=("$f")
done
if [[ ${#snapshots[@]} -eq 0 ]]; then
  log "WARN: no raw snapshots in data/ — archive creation skipped"
elif [[ -z "$archive_name" ]]; then
  : # derivation already warned above
elif [[ -f "$archive_path" ]]; then
  log "archive $archive_name already exists — skip creation"
elif [[ "$DRY_RUN" == "1" ]]; then
  log "[dry-run] would create $archive_path (${snapshots[*]})"
else
  tar -czf "$archive_path" -C "$REPO_ROOT/data" "${snapshots[@]}"
  log "archived ${snapshots[*]} → $archive_path"
fi

if [[ -d "$archive_dir" ]]; then
  arch_prune=""
  if ! arch_prune="$(node "$HELPER" archive-prune --dir "$archive_dir" --max-age-days "$ARCHIVE_MAX_AGE_DAYS")"; then
    log "WARN: archive-prune planning failed — skipping archive prune"
    arch_prune=""
    [[ $rc -eq 0 ]] && rc=1
  fi
  if [[ -z "$arch_prune" ]]; then
    log "no archive files to prune (max-age=${ARCHIVE_MAX_AGE_DAYS}d)"
  else
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      if [[ "$DRY_RUN" == "1" ]]; then
        log "[dry-run] would delete $archive_dir/$f"
      else
        rm -f "$archive_dir/$f"
        log "pruned archive $f"
      fi
    done <<<"$arch_prune"
  fi
fi

log "DONE archive+tag (rc=$rc)"
exit "$rc"
