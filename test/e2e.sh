#!/bin/bash
# end-to-end test of cni-store-proxy

# CUBE should be running before the start of this script.
# this script should be started by the command `yarn test`

test_dir=$(dirname "$(readlink -f "$0")")
cd $test_dir
[ -f ../.env ] && source ../.env

./prepare.test.sh || exit 1

# start the server and wait for it
#log=$(mktemp --suffix .log -t cni-store-proxy-XXXX)

yarn run serve &
pid=$!

online=
for poll in {0..5}; do
  sleep 1
  http -p '' --check-status :$PORT/api/v1/users/ 2> /dev/null \
    && online=y && break
done

if [ -z "$online" ]; then
  echo "server failed to start, see $log for details"
  kill -9 $pid
fi

./integration.test.sh

# Cleanup
#########

echo "Stopping server..."
kill $pid

