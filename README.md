# ![ChRIS Logo](https://raw.githubusercontent.com/FNNDSC/ChRIS_ultron_backEnd/master/docs/assets/logo_chris.png) CNI ChRIS Store Proxy

[![E2E CI](https://github.com/FNNDSC/cni-store-proxy/workflows/E2E%20CI/badge.svg)](https://github.com/FNNDSC/cni-store-proxy/actions)
[![GitHub license](https://img.shields.io/github/license/FNNDSC/cni-store-proxy)](https://github.com/FNNDSC/cni-store-proxy/blob/master/LICENSE)

A proxy to the _ChRIS Store_ API written in _express.js_ for running the
[CNI MICCAI Challenge](http://fnndsc.childrens.harvard.edu/cnichallenge/).

## Summary

Successful plugin upload to the ChRIS Store via `POST /api/v1/plugins/`
automatically triggers a function to register the plugin in CUBE and to
create a feed:

```
pl-test_data_generator -> <uploaded_plugin> -> pl-cni_challenge_evaluation
```

- https://github.com/Sandip117/pl-test_data_generator
- evaluator plugin is not implemented

Every other endpoint is proxied. This app should work exactly the same
as the actual ChRIS Store API.

## API

API | description
----|------------
`/api/v1/*` | transparently proxied to ChRIS_store
POST `/api/v1/plugins/` | on successful upload to ChRIS_store, plugin name is relayed to CUBE, registered, and the challenge feed is created.
`/cni/<N>/` | what's the status of a job? Where `<N>` is the plugin ID in the ChRIS_Store corresponding to a user's submission
`/cni/<N>/files/` | list files produced by the evaluator plugin
`/cni/<N>/files/<F>/<filename>`| download `filename` from CUBE

### Example Results Responses

#### `/cni/<N>/`

`status` will be one of

1. `waitingForPrevious`
2. `scheduled`
3. `started`
4. `finishedSuccessfully`

```json
{
  "files": "/cni/4/files/",
  "plugin_name": "cni-evaluator",
  "plugin_version": "1.0.8",
  "status": "finishedSuccessfully",
  "summary": "{\"compute\": {\"return\": {\"l_logs\": [\"your stuff was evaluated\"], \"l_status\": [\"finishedSuccessfully\"], \"status\": true}, \"status\": true, \"submit\": {\"status\": true}}, \"pullPath\": {\"status\": true}, \"pushPath\": {\"status\": true}, \"status\": true, \"swiftPut\": {\"status\": true}}"
}
```

#### `/cni/<N>/files/`

List files produced by the evaluator plugin.

```json
{
  "results": [
    {
      "creation_date": "2021-01-13T06:13:02.358853-05:00",
      "file_resource": "/cni/5/files/529/timestamp.json"
    },
    {
      "creation_date": "2021-01-13T06:13:02.357315-05:00",
      "file_resource": "/cni/5/files/528/output.meta.json"
    },
    {
      "creation_date": "2021-01-13T06:13:02.356109-05:00",
      "file_resource": "/cni/5/files/527/jobStatusSummary.json"
    },
    {
      "creation_date": "2021-01-13T06:13:02.354619-05:00",
      "file_resource": "/cni/5/files/526/jobStatus.json"
    },
    {
      "creation_date": "2021-01-13T06:13:02.352574-05:00",
      "file_resource": "/cni/5/files/525/input.meta.json"
    },
    {
      "creation_date": "2021-01-13T06:13:02.356415-05:00",
      "file_resource": "/cni/5/files/525/results.csv"
    }
  ]
}
```

#### `/cni/<N>/files/<F>/results.csv`

Just a file download.

```
how you did,out of 8
you did gr8,8
```

### User Workflow

1. Register an account on the ChRIS store.
2. Upload your plugin to the ChRIS store.
3. check progress at `GET /cni/<pluginId>/`
4. download results from `GET /cni/<pluginId>/files/<F>/evaluation.tsv`

#### User Example

Literally the same usage as ChRIS store API.

```bash
http POST :8011/api/v1/users/ \
  Content-Type:application/vnd.collection+json \
  template:='{"data":
      [{"name":"email","value":"alice@example.com"},
      {"name":"username","value":"alice"},
      {"name":"password","value":"alice12345"}]}'

http -a alice:alice12345 -f POST :8011/api/v1/plugins/ \
  dock_image=fnndsc/pl-simpledsapp:latest \
  public_repo=https://github.com/FNNDSC/pl-simpledsapp \
  descriptor_file@$PWD/SimpleDSApp.json \
  name=try1
```

## Preconditions

Copy the SSH key of the system user who runs `server.js` onto the
box running CUBE in _docker_. Other CUBE deployment setups on PaaS
(e.g. Kubernetes, Openshift) require a custom implementation of
`plugin2cube.sh`.

## Development

`yarn` scripts in `package.json` are meant for ease of development where
this node.js application is run on-the-metal and CUBE is run in a development-mode.

Dependencies: `git nodejs yarn docker docker-compose`

1. `yarn`
2. `yarn start`

## Architecture

Assuming the ChRIS store backend is `https://chrisstore.co/api/v1/cmd/`.

Typically, requests to `/api/v1/cmd` are forwarded verbatim to `https://chrisstore.co/api/v1/cmd/`.

```
+------+  /api/v1/*   +-----------------+
| user | -----------> | cni-store-proxy |
+------+              +-----------------+
                         |
                         |
                      +-------------+
                      | ChRIS_store |
                      | backend     |
                      +-------------+
```

The proxy listens for a `201 Created` response from `/api/v1/plugins/`.
This means a plugin was uploaded successfully into the ChRIS store. The plugin
is automatically registered into ChRIS and scheduled to run in a feed.

```
+------+
| user |
+------+
  |
  | (0) POST
  |     /api/v1/plugins/
  ▼
+-----------------+  (3) uploadPlugin.sh         +------+
|                 | ---------------------------> |      |
| cni-store-proxy |                              | CUBE |
|                 |  (4) POST                    |      |
|                 |      /api/v1/<N>/instances/  |      |
|                 | ---------------------------> |      |
+-----------------+                              +------+
  ▲
  | (1) 201
  |     Created
  |
+-------------+
| ChRIS_store |
| backend     |
+-------------+
```

Endpoints under `/cni/*` are authenticated against ChRIS_store.
Requests are proxied transparently to CUBE, e.g.

- `cni.chrisproject.org/cni/3/` --> `cube.chrisproject.org/api/v1/plugins/instances/5/` (is the job done running? where are the files?)
- `cni.chrisproject.org/cni/3/files/?limit=500&offset=0` --> `cube.chrisproject.org/api/v1/plugins/instances/5/files/?limit=500&offset=0` (list files)
- `cni.chrisproject.org/cni/3/files/300/result.csv` --> `cube.chrisproject.org/api/v1/files/396/result.csv` (download an output file)

```
+------+
| user |
+------+
  |
  | (0) "Request"
  |     GET
  |     /cni/<pluginId>/
  ▼
+-----------------+  (2) GET
|                 |      /api/v1/<M>/instances/<M>/   +------+
| cni-store-proxy | --------------------------------> | CUBE |
|                 |                                   +------+
+-----------------+
  |
  | (1) "Authorization"
  |     GET /api/v1/
  |     GET /api/v1/users/<N>/ownedpluginmetas/
  |     i.e. is user logged in?
  |          does user <N> own <pluginId> in the store?
  ▼
+-------------+
| ChRIS_store |
| backend     |
+-------------+
```

## Resources

- https://cni.chrisproject.org/
- https://github.com/FNNDSC/pl-cni_challenge
- https://github.com/FNNDSC/CHRIS_docs/blob/master/workflows/MICCAI-Workflow.md

## TODO

- Pagination of plugin searching. Currently, there is a limit of 50 submissions per account.
- Tests

## Production

Single-machine deployment can be orchestrated by `docker-compose`.

`cni-store-proxy` needs special administrative access to CUBE because
plugins cannot be registered over an HTTP API. As a workaround,
`cni-store-proxy` and CUBE run in the same container so that
`cni-store-proxy` can directly invoke
`python plugins/services/manager.py`.

1. Create internally-used backend secrets:
https://github.com/FNNDSC/ChRIS_ultron_backEnd/wiki/ChRIS-backend-production-services-secret-configuration-files
2. Generate JSON representations for your fs and evaluator plugins and set `FS_PLUGIN_FILE` and `EVALUATOR_FILE` accordingly.

**For ChRIS_store (in `secrets/.chris_store.env`) `DJANGO_USE_X_FORWARDED_HOST=true` should be set.**

```bash
docker run -u $(id -u) -v $PWD/secrets:/json --rm sandip117/pl-test_data_generator test_data_generator.py --savejson /json
docker run -u $(id -u) -v $PWD/secrets:/json --rm aiwc/cni_challenge_evaluation cni_challenge_evaluation.py --savejson /json
```

Start everything:

```bash
docker swarm init --advertise-addr=127.0.0.1
docker-compose up
```

If `CNI_COMPUTE_ENV` is not host, then you will need to change the address of `pfcon`
in http://localhost:8000/chris-admin/ or run

```bash
docker-compose exec cni-and-cube python plugins/services/manager.py modify $CNI_COMPUTE_ENV --url http://somewhere.else:5005
```

After `cni-store-proxy` comes online

```bash
until curl -s 'http://localhost:8011/api/v1/users/ | grep -q username'; do
  sleep 5;
done
```

Everything will be ready to go.

Tip: If behind a reverse-proxy, set `CNI_BACKEND_TRUST_PROXY=y`
