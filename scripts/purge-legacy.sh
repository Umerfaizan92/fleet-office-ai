#!/usr/bin/env bash
# One-click legacy purge (Linux / macOS / Git Bash).
#   scripts/purge-legacy.sh            dry run: lists what would be removed, changes nothing
#   scripts/purge-legacy.sh --apply    archive -> delete -> verify -> (auto-restore if verification fails)
# Options: --yes (skip the typed confirmation)  --no-verify (skip the post-purge checks; not recommended)
# The list of files lives in scripts/legacy-files.txt. .env files, node_modules, .git, data/, uploads/ and databases are never touched.
set -euo pipefail

APPLY=0; YES=0; VERIFY=1
for a in "$@"; do case "$a" in --apply) APPLY=1;; --yes) YES=1;; --no-verify) VERIFY=0;; -h|--help) sed -n 2,7p "$0"; exit 0;; *) echo "Unknown option: $a" >&2; exit 2;; esac; done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[ -f package.json ] && [ -f src/server.js ] && [ -f scripts/legacy-files.txt ] || { echo "Run this from a Super Pro checkout (package.json, src/server.js, scripts/legacy-files.txt)." >&2; exit 2; }

PROTECTED='(^|/)(\.env[^/]*|node_modules|\.git|data|uploads)(/|$)|\.(sqlite|sqlite3|db)(-wal|-shm)?$'
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
: > "$TMP/raw"

while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"; line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ -z "$line" ] && continue
  case "$line" in
    /*|*..*) echo "Refusing unsafe entry in legacy-files.txt: $line" >&2; exit 2;;
    glob:*) find . -type f -name "${line#glob:}" -not -path './node_modules/*' -not -path './.git/*' 2>/dev/null | sed 's#^\./##' >> "$TMP/raw";;
    */) [ -d "${line%/}" ] && find "${line%/}" -type f | sed 's#^\./##' >> "$TMP/raw" || true;;
    *) [ -f "$line" ] && echo "$line" >> "$TMP/raw" || true;;
  esac
done < scripts/legacy-files.txt

sort -u "$TMP/raw" | grep -Ev "$PROTECTED" > "$TMP/files" || true
COUNT="$(wc -l < "$TMP/files" | tr -d ' ')"

if [ "$COUNT" = 0 ]; then echo "Nothing to purge. The repository is already clean."; exit 0; fi
echo "Legacy files ($COUNT):"; while IFS= read -r f; do printf '  %8s  %s\n' "$(wc -c < "$f" | tr -d ' ')" "$f"; done < "$TMP/files"

if [ "$APPLY" = 0 ]; then echo; echo "Dry run only. Nothing was changed. Re-run with --apply to archive and delete these files."; exit 0; fi

if [ "$YES" = 0 ]; then printf '\nType PURGE to archive and delete these %s files: ' "$COUNT"; read -r answer; [ "$answer" = PURGE ] || { echo "Cancelled."; exit 1; }; fi

ARCHIVE="$(dirname "$ROOT")/$(basename "$ROOT")-legacy-archive-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$ARCHIVE" -T "$TMP/files"
[ "$(tar -tzf "$ARCHIVE" | wc -l | tr -d ' ')" = "$COUNT" ] || { echo "Archive verification failed. Nothing was deleted." >&2; rm -f "$ARCHIVE"; exit 1; }
echo "Archived to: $ARCHIVE"

while IFS= read -r f; do rm -f -- "$f"; d="$(dirname "$f")"; while [ "$d" != "." ] && rmdir "$d" 2>/dev/null; do d="$(dirname "$d")"; done; done < "$TMP/files"
echo "Deleted $COUNT files."

if [ "$VERIFY" = 1 ]; then
  echo "Verifying the cleaned repository..."
  if node scripts/verify-all.mjs --fast && node scripts/validate-final.mjs; then
    if [ -d .git ] && command -v git >/dev/null 2>&1; then node scripts/update-manifest.mjs; fi
    echo "Purge complete and verified. Archive kept at: $ARCHIVE"
  else
    echo "Verification FAILED. Restoring every purged file from the archive." >&2
    tar -xzf "$ARCHIVE" -C "$ROOT"
    echo "Restored. Nothing was lost. Please send the output above for review." >&2
    exit 1
  fi
else
  echo "Purge complete (verification skipped). Archive kept at: $ARCHIVE"
fi
