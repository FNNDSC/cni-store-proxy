#!/bin/bash

CUBE_USER="chris:chris1234"
STORE_USER="cubeadmin:cubeadmin1234"

STORE_URL="http://localhost:8011"

FS_PLUGIN="sandip117/pl-test_data_generator"


# upload FS plugin

tmpdir=$(mktemp -d -t chris-$(date +%Hh%M,%S)-XXXXXXXXX)
docker run -v $tmpdir:/json --rm -u $(id -u) $FS_PLUGIN \
  test_data_generator.py --savejson /json
descriptor_file=$(echo $tmpdir/*.json)
http -o $tmpdir/store_upload.json -a $STORE_USER -f POST $STORE_URL/api/v1/plugins/ \
  dock_image=$FS_PLUGIN descriptor_file@$descriptor_file          \
  public_repo=https://github.com/sandip117/pl-test_data_generator \
  name=test_data_generator
