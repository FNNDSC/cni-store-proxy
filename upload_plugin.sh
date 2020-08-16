#!/bin/bash
# As far as I know, there is no way to register a plugin via REST API
# (it is possible from an HTML webpage at /chris-admin/)

#docker-compose -f docker-compose_dev.yml             \
#  exec chris_dev python plugins/services/manager.py  \
#  register host --pluginname $1

# docker-compose might not be able to find the container by name
# because of how chris_dev_1 is restarted

CUBE_CONTAINER=e6983cbaf887

ssh localhost << EOF
set -e
cd ~/fnndsc/ChRIS_ultron_backEnd
docker exec $CUBE_CONTAINER python plugins/services/manager.py \
  register host --pluginname $1
EOF
