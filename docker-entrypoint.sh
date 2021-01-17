#!/bin/bash

# forward termination signals to children
trap 'kill -s TERM $(jobs -p)' TERM INT

# whenever a child dies, we want to kill the parent too
# so that all children are killed together.
# that way the container shuts down in unison on failure
# and the restart policy can be managed by docker.

function basket () {
  # caveat: subshell doesn't catch kill signals itself
  ( $@ ; kill $$ ) &
}

# if this script has been run before, we should skip initialization steps
if [ -f ~/cni-backend/is-prepared ]; then
  CNI_PREPRARED=y
else
  mkdir ~/cni-backend
fi

# ========================================
# start CUBE in the background
# ========================================

cd $APPROOT
basket /usr/src/docker-entrypoint.sh mod_wsgi-express start-server \
  config/wsgi.py --host 0.0.0.0 --port 8000 --processes 8 \
  --server-root /home/localuser/mod_wsgi-0.0.0.0:8000
cd - > /dev/null

# ========================================
# wait for CUBE to come online
# ========================================

echo "Before CNI preparation, waiting for CUBE..."

for i in {0..120}; do
  curl -s http://localhost:8000/api/v1/users/ | grep -q username \
    && curl -s        $CHRIS_STORE_URL/users/ | grep -q username \
    && online=y && break
  sleep 5
done

if [ -z "$online" ]; then
  echo "Timed out waiting for CUBE."
  exit 1
fi

# ========================================
# setup and preparation
# ========================================

if [ -z "$CNI_PREPRARED" ]; then
  CNI_COMPUTE_ENV=${CNI_COMPUTE_ENV:-host}
  python $APPROOT/plugins/services/manager.py add \
    $CNI_COMPUTE_ENV "http://pfcon.local:5005" \
    --description "Compute environment used for CNI challenge submissions and evaluation"

  # configure plugin registration for cohosted CUBE
  cat  > plugin2cube.sh <<< '#!/bin/sh -e'
  cat >> plugin2cube.sh <<< "python $APPROOT/plugins/services/manager.py register "$CNI_COMPUTE_ENV" --pluginname \$1"

  # If a file exists, then read it.
  # Else fill it with random data and return that data.
  function load_password () {
    if [ ! -f "$1" ]; then
      head /dev/urandom | tr -dc A-Za-z0-9 | head -c 60 > $1
    fi
    < $1
  }
else
  echo "Skipping preparation and restarting cni-store-proxy"

  # if password files are needed then they would have already been created
  function load_password () {
    < $1 || \
      echo "$1 missing, system is compromised" \
      exit 1
  }
fi

if [ -z "$CUBE_PASSWORD" ]; then
  export CUBE_PASSWORD="$(load_password ~/cni-backend/cube_password)"
fi

if [ -z "$CHRISSTORE_PASSWORD" ]; then
  export CHRISSTORE_PASSWORD="$(load_password ~/cni-backend/chrisstore_password)"
fi

# prepare CUBE for the CNI challenge
./prepare.sh

if [ "$?" = "0" ]; then
  touch ~/cni-backend/is-prepared
else
  echo "CNI backend preparation failed."
  exit 1
fi

# ========================================
# start the CNI backend application server
# ========================================

basket yarnpkg run serve

# don't end script because servers are running in the background
wait
