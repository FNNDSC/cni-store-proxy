#!/bin/bash

source .env

# ========================================
# upload FS plugin
# ========================================

tmpdir=$(mktemp -d -t chris-$(date +%Hh%M,%S)-XXXXXXXXX)
docker run -v $tmpdir:/json --rm -u $(id -u) $FS_PLUGIN_DOCKER \
  test_data_generator.py --savejson /json
descriptor_file=$(echo $tmpdir/*.json)
http -o $tmpdir/store_upload.json -a $STORE_USER -f POST $REAL_STORE_URL/api/v1/plugins/ \
  dock_image=$FS_PLUGIN_DOCKER descriptor_file@$descriptor_file          \
  public_repo=https://github.com/sandip117/pl-test_data_generator \
  name=$FS_PLUGIN_NAME
./upload_plugin.sh $FS_PLUGIN_NAME

# TODO upload DS evaluator plugin

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
http -a "$CUBE_USER" PUT "$feed_url"           \
  Content-Type:application/vnd.collection+json \
  template:='{"data": [{"name": "name", "value": "Example CNI Challenge"}]}'
http -a "$CUBE_USER" PUT http://localhost:8000/api/v1/note$feed_id/ \
  Content-Type:application/vnd.collection+json                      \
  template:='{"data": [{"name": "title", "value": "Description"},
             {"name": "content", "value":"collection+json was a mistake"}]}'


echo "feed url is $feed_url"

# TODO write parent feed information to a .env file
