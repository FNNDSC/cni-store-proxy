#!/bin/bash

source .env

if ! docker exec $CUBE_CONTAINER /bin/true; then
  echo CUBE_CONTAINER is not correct
  exit 1
fi

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
  http -p '' -a "$STORE_USER" -f POST "$REAL_STORE_URL/api/v1/plugins/" \
    dock_image=$dock_image descriptor_file@$descriptor_file             \
    public_repo=$repo name=$plugin_name
  ./upload_plugin.sh $plugin_name
  rm -r $tmpdir
}

upload_plugin $FS_PLUGIN_DOCKER $FS_PLUGIN_NAME $FS_PLUGIN_REPO
upload_plugin $EVALUATOR_DOCKER $EVALUATOR_NAME $EVALUATOR_REPO


# ========================================
# find out instances URL
# ========================================

#  e.g. http://localhost:8000/api/v1/plugins/13/instances/
search_results=$(http -a $CUBE_USER "$CUBE_URL/api/v1/plugins/search/?name=$FS_PLUGIN_NAME" )
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
http -a "$CUBE_USER" POST "$instances_url"     \
  Content-Type:application/vnd.collection+json \
  template:='{ "data": [{ "name": "dir", "value": "/usr/src/data" }]}'
)"

# ========================================
# set feed title and description
# ========================================

feed_id=$(echo $start_run | jq .id)      # e.g. 3
feed_url=$(echo $start_run | jq -r .feed) # e.g. http://localhost:8000/api/v1/3/
http -p '' -a "$CUBE_USER" PUT "$feed_url"           \
  Content-Type:application/vnd.collection+json \
  template:='{"data": [{"name": "name", "value": "'"$FEED_NAME"'"}]}'
http -p '' -a "$CUBE_USER" PUT http://localhost:8000/api/v1/note$feed_id/ \
  Content-Type:application/vnd.collection+json                      \
  template:='{"data": [{"name": "title", "value": "Description"},
             {"name": "content", "value":"collection+json was a mistake"}]}'

echo "feed url is $feed_url"
