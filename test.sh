#!/bin/bash

source .env

http POST $APP_URL/api/v1/users/ \
  Content-Type:application/vnd.collection+json \
  template:='{"data":[
    {"name":"email","value":"hello@babymri.org"},
    {"name":"password","value":"whatever"},
    {"name":"username","value":"hello"}]}'

