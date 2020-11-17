#!/bin/bash

source .env

# There is no way to register a plugin via REST API
# (it is only possible from an HTML webpage at /chris-admin/)

#docker-compose -f docker-compose_dev.yml             \
#  exec chris_dev python plugins/services/manager.py  \
#  register host --pluginname $1

ssh -T localhost << EOF
set -e
docker exec $CUBE_CONTAINER python plugins/services/manager.py \
  register ${2:-host} --pluginname $1
EOF

#http -a "$CUBE_USERNAME:$CUBE_PASSWORD" "$CUBE_URL/api/v1/plugins/search/?name=$1"
