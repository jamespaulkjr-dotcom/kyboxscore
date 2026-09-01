#!/usr/bin/env bash
# Hourly RPI recompute.
#
# Installed on the droplet at /home/deploy/kyboxscore/recompute-rpi.sh and run
# from deploy's crontab. Lives in the repo so it is version controlled and so a
# rebuilt droplet can be brought back to the same state.
#
# Deliberately simple: no --sport, so it covers every sport with a season open
# and stays correct as sports are added. The script prunes its own history.
set -euo pipefail

cd /home/deploy/kyboxscore

LOG=/home/deploy/kyboxscore/logs/rpi.log
mkdir -p "$(dirname "$LOG")"

# A deploy briefly stops the web container. Skipping is correct: the next hour
# picks it up, and a failed run must not look like a broken rating.
if ! docker compose ps --status running --services 2>/dev/null | grep -qx web; then
  echo "$(date -Is)  web not running, skipped" >> "$LOG"
  exit 0
fi

{
  echo "--- $(date -Is)"
  docker compose exec -T web \
    node --experimental-strip-types packages/db/scripts/rpi.ts 2>&1
} >> "$LOG"

# Keep the log to the last 2000 lines; this runs every hour forever.
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
