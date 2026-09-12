#!/usr/bin/env bash
# Ohio opponents' records, from OHSAA's weekly Harbin computer ratings report.
#
# Installed at /home/deploy/kyboxscore/harbin-import.sh and run daily from
# deploy's crontab. The report appears on Tuesdays from the fifth week of the
# season, so most runs find nothing and say so: the script is the schedule, so
# a missed Tuesday is picked up the next day rather than lost for a week.
#
# Ohio is the Harbin report or it is manual entry. See
# docs/out-of-state-sources.md for why every other Ohio source is out.
set -euo pipefail

cd /home/deploy/kyboxscore

LOG=/home/deploy/kyboxscore/logs/harbin.log
mkdir -p "$(dirname "$LOG")"

# A deploy briefly stops the web container; the next day picks it up.
if ! docker compose ps --status running --services 2>/dev/null | grep -qx web; then
  echo "$(date -Is)  web not running, skipped" >> "$LOG"
  exit 0
fi

{
  echo "--- $(date -Is)"
  docker compose exec -T web \
    node --experimental-strip-types packages/db/scripts/harbin-import.ts 2>&1
} >> "$LOG"

# Records feed Shadow RPI, and the hourly recompute picks them up on its own.
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
