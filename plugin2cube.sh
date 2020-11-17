#!/bin/bash
# There is no way to register a plugin via REST API
# (it is only possible from an HTML webpage at /chris-admin/)
# This script is suitable for local testing using minimake,
# however a non-local production box would require a custom implementation.
# Maybe using SSH or exposing the dockerd socket on a TCP port.

#docker-compose -f docker-compose_dev.yml             \
#  exec chris_dev python plugins/services/manager.py  \
#  register host --pluginname $1

if [ -z "$1" ]; then
  echo "usage: $0 PL-PLUGINNAME [compute_env (default: 'host')]"
  exit 1
fi

ENV="${ENV:-$(dirname "$(readlink -f "$0")")/.env}"

if [ -f "$ENV" ]; then
  source $ENV
fi

set -e
docker exec "${CUBE_CONTAINER:-chris}" python plugins/services/manager.py \
  register "${2:-host}" --pluginname "$1"

# to verify registration is correct
#http -a "$CUBE_USERNAME:$CUBE_PASSWORD" "$CUBE_URL/api/v1/plugins/search/?name=$1"
