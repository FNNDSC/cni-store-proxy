#!/bin/bash
# end-to-end test of cni-store-proxy

# CUBE should be running before the start of this script.
# this script should be started by the command `yarn test`

source .env

# override variables by appending them to .env
cp .env .env.bak  # TODO some better way to do hide this file
cat >> .env << EOF
CUBE_URL="http://localhost:8000"
REAL_STORE_URL="http://localhost:8010"
CUBE_CONTAINER=chris
EOF

./prepare.sh

# TODO assertion

mv .env.bak .env
