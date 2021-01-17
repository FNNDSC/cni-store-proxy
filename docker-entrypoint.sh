#!/bin/bash

# forward termination signals to children
trap 'kill -s TERM $(jobs -p)' TERM INT

# patch CUBE to use a different job IDs for pman
if [ -n "$CUBE_JID_PREFIX" ]; then
  sed -i "s/chris-jid-/$CUBE_JID_PREFIX/" $APPROOT/plugininstances/services/manager.py
fi

# ========================================
# start CUBE in the background
# ========================================

cd $APPROOT
/usr/src/docker-entrypoint.sh mod_wsgi-express start-server \
  config/wsgi.py --host 0.0.0.0 --port 8000 --processes 8 \
  --server-root /home/localuser/mod_wsgi-0.0.0.0:8000 &
cd - > /dev/null

# ========================================
# wait for CUBE to come online
# ========================================

echo "before CNI preparation, waiting for CUBE..."

for i in {0..60}; do
  curl -s http://localhost:8000/api/v1/users/ | grep -q username \
    && curl -s        $CHRIS_STORE_URL/users/ | grep -q username \
    && online=y && break
  sleep 2
done

if [ -z "$online" ]; then
  echo "Timed out waiting for CUBE."
  exit 1
fi

# ========================================
# setup and preparation
# ========================================

CNI_COMPUTE_ENV=${CNI_COMPUTE_ENV:-host}
python $APPROOT/plugins/services/manager.py add \
  $CNI_COMPUTE_ENV "http://pfcon.local:5005" \
  --description "Compute environment used for CNI challenge submissions and evaluation"

# configure plugin registration for cohosted CUBE
cat > plugin2cube.sh << EOF
#!/bin/sh -e
python $APPROOT/plugins/services/manager.py \
  register "$CNI_COMPUTE_ENV" --pluginname "\$1"
EOF

# set passwords
function generate_password () {
  head /dev/urandom | tr -dc A-Za-z0-9 | head -c "${1:-60}"
}

if [ -z "$CUBE_PASSWORD" ]; then
  export CUBE_PASSWORD="$(generate_password)"
fi

if [ -z "$CHRISSTORE_PASSWORD" ]; then
  export CUBE_PASSWORD="$(generate_password)"
fi

# preprare CUBE for the CNI challenge
./prepare.sh

# ========================================
# start the CNI backend application server
# ========================================

yarnpkg run serve &

# don't end script because servers are running in the background
wait
