#!/bin/bash

# ========================================
# setup
# ========================================

config_json=$(node -p 'JSON.stringify(require("./src/config"))')

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

# ========================================
# get plugin representations
# ========================================

function pull_image_if_needed () {
  local dock_image=$1
  local variable_name=$2
  local descriptor_file="${!variable_name}"

  if [ -f "$descriptor_file" ]; then
    return 0
  elif ! docker version > /dev/null; then
    >&2 echo "error: $variable_name not specified, and cannot use docker"
    exit 1
  elif [ -z "$(docker images --format '{{.ID}}' $dock_image)" ]; then
    >&2 docker pull $dock_image
  fi

  local script=$(docker inspect --format '{{ (index .Config.Cmd 0) }}' $dock_image)

  descriptor_file=$(mktemp --suffix=.json)
  docker run --rm $dock_image $script --json > $descriptor_file
  eval "export $variable_name=$descriptor_file"
}

pull_image_if_needed $FS_PLUGIN_DOCKER FS_PLUGIN_FILE
pull_image_if_needed $EVALUATOR_DOCKER EVALUATOR_FILE

# ========================================
# check if preparation is needed, or has already been done
# ========================================

check_feed=$(
  curl -s "$CUBE_URL/api/v1/search/?name=$(node -p "encodeURIComponent('$FEED_NAME')")" \
    -u "$CUBE_AUTH" -H "Accept: application/json"
)

num_results=$(echo $check_feed | jq .count)
if [ "$num_results" != "null" ] && [ "$num_results" -ge "1" ]; then
  >&2 echo "Already found feed with name \"$FEED_NAME\""
  >&2 echo "creation_date: $(echo $check_feed | jq -r '.results[0].creation_date')"
  echo "$(echo $check_feed | jq -r .results[0].url)"
  exit 0
fi

if [ -k CNI_CUBE_CONTAINER ] && ! docker exec $CNI_CUBE_CONTAINER /bin/true; then
  >&2 echo CUBE_CONTAINER is not correct
  >&2 echo Did nothing.
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

function upload_plugin () {
  curl -so /dev/null -u "$STORE_AUTH" "$STORE_URL/api/v1/plugins/" \
    -F "name=$2" \
    -F "dock_image=$1"  \
    -F "descriptor_file=@$4" \
    -F "public_repo=$3"
  ./plugin2cube.sh $2
}

upload_plugin $FS_PLUGIN_DOCKER $FS_PLUGIN_NAME $FS_PLUGIN_REPO $FS_PLUGIN_FILE
upload_plugin $EVALUATOR_DOCKER $EVALUATOR_NAME $EVALUATOR_REPO $EVALUATOR_FILE


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
