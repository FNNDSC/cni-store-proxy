# CNI ChRIS Store Proxy

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

## Preconditions

Copy the SSH key of the system user who runs `server.js` onto the
box running CUBE in _docker_. Other CUBE deployment setups on PaaS
(e.g. Kubernetes, Openshift) require a custom implementation of
`plugin2cube.sh`.

## Development

1. Start [ChRIS_ultron_backEnd](https://github.com/FNNDSC/ChRIS_ultron_backEnd): `./make.sh` or `./docker-deploy.sh`
2. Set `.env`
3. Run `./prepare.sh` (depends on [`jq`](https://stedolan.github.io/jq/))
4. `yarn`
5. `yarn start`

## User Workflow

1. Register an account on the ChRIS store.
2. Upload your plugin to the ChRIS store.
3. TODO check progress at `GET /cni/<pluginId>/instances/`
4. TODO download results from `GET /cni/<pluginId>/files/evaluation.tsv`

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
+-----------------+  (3) uploadPlugin.sh        +------+
|                 | --------------------------> |      |
| cni-store-proxy |                             | CUBE |
|                 |  (4) POST                   |      |
|                 |      /api/v1/<N>/instances  |      |
|                 | --------------------------> |      |
+-----------------+                             +------+
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

- `cni.chrisproject.org/cni/3/instances/` --> `cube.chrisproject.org/api/v1/plugins/instances/5/` (is the job done running? where are the files?)
- `cni.chrisproject.org/cni/3/instances/files?limit=500&offset=0` --> `cube.chrisproject.org/api/v1/plugins/instances/5/files/?limit=500&offset=0` (list files)
- `cni.chrisproject.org/cni/3/files/result.csv` --> `cube.chrisproject.org/api/v1/files/396/result.csv` (download an output file)

```
+------+
| user |
+------+
  |
  | (0) "Request"
  |     GET
  |     /cni/<pluginId>/instances/
  ▼
+-----------------+  (2) "Transparent proxy"
|                 |      GET
| cni-store-proxy |      /api/v1/<M>/instances/  +------+
|                 | ---------------------------> | CUBE |
+-----------------+                              +------+
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

## Production

- Set `.env`
- Non-local CUBE necessitates a custom implementation of `plugin2cube.sh`

## Resources

- http://fnndsc.childrens.harvard.edu/cnichallenge/
- https://github.com/FNNDSC/pl-cni_challenge
- https://github.com/FNNDSC/ChRIS_ultron_backEnd/wiki/MICCAI-Work-Flow-(WIP)

