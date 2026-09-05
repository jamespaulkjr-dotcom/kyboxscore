#!/usr/bin/env bash
# How many people used the site.
#
# Installed on the droplet at /home/deploy/kyboxscore/traffic.sh. Lives in the
# repo so it is version controlled and a rebuilt droplet gets it back.
#
# Caddy writes its access log as root with mode 600, which is right, so the
# report runs in a throwaway container that can read it rather than loosening
# the permissions on a file full of visitor addresses.
#
#   ./traffic.sh              last 7 days
#   ./traffic.sh --days 1     today
#   ./traffic.sh --pages 25
set -euo pipefail

LOGS=/home/deploy/kyboxscore/logs/caddy
SCRIPT=/home/deploy/code/kyboxscore/scripts/traffic.mjs

docker run --rm \
  -v "$LOGS":/logs:ro \
  -v "$SCRIPT":/traffic.mjs:ro \
  -e CADDY_LOG_DIR=/logs \
  node:22-alpine node /traffic.mjs "$@"
