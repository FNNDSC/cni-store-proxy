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

## Development

1. Start [ChRIS_ultron_backEnd](https://github.com/FNNDSC/ChRIS_ultron_backEnd): `./make.sh` or `./docker-deploy.sh`
2. Set `.env`
3. Run `./prepare.sh` (depends on `jq`)
4. `yarn`
5. `yarn start`

## User Workflow

1. Register an account on the ChRIS store.
2. Upload your plugin to the ChRIS store.
3. TODO check progress at `GET /cni/<pluginname>/status`
4. TODO download results from `GET /cni/<pluginname>/results`

## Resources

- http://fnndsc.childrens.harvard.edu/cnichallenge/
- https://github.com/FNNDSC/pl-cni_challenge
- https://github.com/FNNDSC/ChRIS_ultron_backEnd/wiki/MICCAI-Work-Flow-(WIP)
