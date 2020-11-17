#!/bin/bash

source_dir=$(dirname "$(readlink -f "$0")")
ENV="${ENV:-$source_dir/.env}"

if [ -f "$ENV" ]; then
  source $ENV
fi

if [ -f "$source_dir/parameters/plugins.env" ]; then
  source $source_dir/parameters/plugins.env
fi

CUBE_AUTH="$CUBE_USERNAME:$CUBE_PASSWORD"
STORE_AUTH="$STORE_USERNAME:$STORE_PASSWORD"

if ! docker exec $CUBE_CONTAINER /bin/true; then
  echo CUBE_CONTAINER is not correct
  echo Did nothing.
  exit 1
fi

>&2 echo "Preparing for the CNI challenge..."

# ========================================
# create users in CUBE and ChRIS_store backends
# ========================================

function create_user () {
  http -p '' --check-status -a "$3:$4" GET "$1/api/v1/" && return 0
  http -p '' POST "$1/api/v1/users/" \
  Content-Type:application/vnd.collection+json \
  template:='{"data":[
    {"name":"email","value":"'"$2"'"},
    {"name":"username","value":"'"$3"'"},
    {"name":"password","value":"'"$4"'"}]}'

  http -p '' --check-status -a "$3:$4" GET "$1/api/v1/"
  if [ "$?" != "0" ]; then
    echo "could not login to $1 as $3"
    exit 1
  fi
}

create_user "$CUBE_URL" "$CUBE_EMAIL" "$CUBE_USERNAME" "$CUBE_PASSWORD"
create_user "$REAL_STORE_URL" "$STORE_EMAIL" "$STORE_USERNAME" "$STORE_PASSWORD"

# ========================================
# upload FS and evaluator plugins
# ========================================

# 1. get plugin JSON
# 2. upload to Store
# 3. register to CUBE
function upload_plugin () {
  local dock_image=$1
  local plugin_name=$2
  local repo=$3
  local script=$(docker inspect $dock_image | jq -r ".[].Config.Cmd[0]")

  local tmpdir=$(mktemp -d -t chris-$(date +%Hh%M,%S)-XXXXXXXXX)
  docker run -v $tmpdir:/j --rm -u $(id -u) $dock_image $script --savejson /j
  descriptor_file=$(echo $tmpdir/*.json)
  http -p '' -a "$STORE_AUTH" -f POST "$REAL_STORE_URL/api/v1/plugins/" \
    dock_image=$dock_image descriptor_file@$descriptor_file             \
    public_repo=$repo name=$plugin_name
  ./plugin2cube.sh $plugin_name
  rm -r $tmpdir
}

upload_plugin $FS_PLUGIN_DOCKER $FS_PLUGIN_NAME $FS_PLUGIN_REPO
upload_plugin $EVALUATOR_DOCKER $EVALUATOR_NAME $EVALUATOR_REPO


# ========================================
# find out instances URL
# ========================================

#  e.g. http://localhost:8000/api/v1/plugins/13/instances/
search_results=$(http -a "$CUBE_AUTH" "$CUBE_URL/api/v1/plugins/search/?name=$FS_PLUGIN_NAME" )
instances_url="$(node << EOF
const searchResults = JSON.parse('$search_results');
for (const data of searchResults.collection.items[0].links) {
  if (data.rel === 'instances') {
    console.log(data.href);
    process.exit(0);
  }
}
process.exit(1);
EOF
)"

# ========================================
# create feed
# ========================================

start_run="$(
http -a "$CUBE_AUTH" POST "$instances_url"     \
  Content-Type:application/vnd.collection+json \
  template:="$(< $source_dir/parameters/fs.json)"
)"

# ========================================
# set feed title and description
# ========================================

feed_id=$(echo $start_run | jq .id)      # e.g. 3
feed_url=$(echo $start_run | jq -r .feed) # e.g. http://localhost:8000/api/v1/3/
http -p '' -a "$CUBE_AUTH" PUT "$feed_url"           \
  Content-Type:application/vnd.collection+json \
  template:='{"data": [{"name": "name", "value": "'"$FEED_NAME"'"}]}'
http -p '' -a "$CUBE_AUTH" PUT http://localhost:8000/api/v1/note$feed_id/ \
  Content-Type:application/vnd.collection+json                      \
  template:='{"data": [{"name": "title", "value": "Description"},
             {"name": "content", "value":"'"$FEED_DESCRIPTION"'"}]}'

echo $feed_url

