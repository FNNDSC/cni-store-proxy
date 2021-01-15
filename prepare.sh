#!/bin/bash

config_json=$(node <<< 'console.log(JSON.stringify(require("./src/config")))')

function get_config () {
  echo $config_json | jq -r "$1"
}

CUBE_URL=$(get_config '.cube.url')
CUBE_USERNAME=$(get_config '.cube.username')
CUBE_PASSWORD=$(get_config '.cube.password')
CUBE_EMAIL=$(get_config '.cube.email')
STORE_URL=$(get_config '.chrisStore.url')
STORE_USERNAME=$(get_config '.chrisStore.username')
STORE_PASSWORD=$(get_config '.chrisStore.password')
STORE_EMAIL=$(get_config '.chrisStore.email')

FS_PLUGIN_DOCKER=$(get_config '.plugins.fs.docker')
FS_PLUGIN_NAME=$(get_config '.plugins.fs.name')
FS_PLUGIN_REPO=$(get_config '.plugins.fs.repo')
EVALUATOR_DOCKER=$(get_config '.plugins.evaluator.docker')
EVALUATOR_NAME=$(get_config '.plugins.evaluator.name')
EVALUATOR_REPO=$(get_config '.plugins.evaluator.repo')

FEED_NAME=$(get_config '.feed.name')
FEED_DESCRIPTION=$(get_config '.feed.description')
CNI_FS_ARGS=$(get_config '.runArgs.fs | tostring')

CUBE_AUTH="$CUBE_USERNAME:$CUBE_PASSWORD"
STORE_AUTH="$STORE_USERNAME:$STORE_PASSWORD"

if [ -k CNI_CUBE_CONTAINER ] && ! docker exec $CNI_CUBE_CONTAINER /bin/true; then
  echo CUBE_CONTAINER is not correct
  echo Did nothing.
  exit 1
fi

>&2 echo "Preparing for the CNI challenge..."

# ========================================
# create users in CUBE and ChRIS_store backends
# ========================================

function create_user () {
  res_code=$(curl -so /dev/null  -w '%{http_code}' -u "$3:$4" "$1/api/v1/")
  [ "$res_code" = "200" ] && return 0  # account already exists
  
  curl -so /dev/null "$1/api/v1/users/" \
    -H 'Content-Type: application/vnd.collection+json' \
    --data '{"template":{"data":[
    {"name":"email","value":"'"$2"'"},
    {"name":"username","value":"'"$3"'"},
    {"name":"password","value":"'"$4"'"}]}}'

  res_code=$(curl -so /dev/null  -w '%{http_code}' -u "$3:$4" "$1/api/v1/")
  if [ "$res_code" != "200" ]; then
    echo "could not login to $1 as $3"
    exit 1
  fi
}

create_user "$CUBE_URL" "$CUBE_EMAIL" "$CUBE_USERNAME" "$CUBE_PASSWORD"
create_user "$STORE_URL" "$STORE_EMAIL" "$STORE_USERNAME" "$STORE_PASSWORD"

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
  docker pull -q $dock_image > /dev/null
  local script=$(docker inspect --format '{{ (index .Config.Cmd 0) }}' $dock_image)

  local descriptor_file=$(mktemp --suffix=.json)
  docker run --rm $dock_image $script --json > $descriptor_file
  curl -so /dev/null -u "$STORE_AUTH" "$STORE_URL/api/v1/plugins/" \
    -F "name=$plugin_name" \
    -F "dock_image=$dock_image"  \
    -F "descriptor_file=@$descriptor_file" \
    -F "public_repo=$repo"
  ./plugin2cube.sh $plugin_name
  rm $descriptor_file
}

upload_plugin $FS_PLUGIN_DOCKER $FS_PLUGIN_NAME $FS_PLUGIN_REPO
upload_plugin $EVALUATOR_DOCKER $EVALUATOR_NAME $EVALUATOR_REPO


# ========================================
# find out instances URL
# ========================================

#  e.g. http://localhost:8000/api/v1/plugins/13/instances/
search_results=$(
  curl -s -u "$CUBE_AUTH" "$CUBE_URL/api/v1/plugins/search/?name=$FS_PLUGIN_NAME" \
    -H 'Accept: application/json'
)
instances_url="$(echo $search_results | jq -r '.results[0].instances')"

# ========================================
# create feed
# ========================================

start_run="$(
curl -s -u "$CUBE_AUTH" "$instances_url" \
  -H 'Content-Type: application/vnd.collection+json' \
  -H 'Accept: application/json' \
  --data "{\"template\":$CNI_FS_ARGS}"
)"

# ========================================
# set feed title and description
# ========================================

feed_id=$(echo $start_run | jq -r .id)      # e.g. 3
feed_url=$(echo $start_run | jq -r .feed) # e.g. http://localhost:8000/api/v1/3/
curl -so /dev/null -u "$CUBE_AUTH" -X PUT "$feed_url" \
  -H 'Content-Type: application/vnd.collection+json' \
  --data '{"template":{"data": [{"name": "name", "value": "'"$FEED_NAME"'"}]}}'
curl -so /dev/null -u "$CUBE_AUTH" -X PUT "http://localhost:8000/api/v1/note$feed_id/" \
  -H 'Content-Type: application/vnd.collection+json' \
  --data '{"template":{"data": [{"name": "title", "value": "Description"},
          {"name": "content", "value":"'"$FEED_DESCRIPTION"'"}]}'

echo $feed_url
