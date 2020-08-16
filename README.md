# CNI ChRIS Store Proxy

A proxy to the _ChRIS Store_ API written in _express.js_ for running the
[CNI MICCAI Challenge](http://fnndsc.childrens.harvard.edu/cnichallenge/).

## Summary

- `POST /api/v1/users/` request is duplicated, creating an account on both
ChRIS Store and CUBE with the same username + password.
- `POST /api/v1/plugins/` successful plugin upload to the ChRIS store
automatically triggers a function to register the plugin in CUBE and to
create a feed:

```
pl-test_data_generator -> <uploaded_plugin> -> pl-cni_challenge_evaluation
```

- https://github.com/Sandip117/pl-test_data_generator
- evaluator plugin is not implemented

Every other endpoint is proxied. This app should work exactly the same
as the actual ChRIS Store API.

## User Workflow

1. Register an account on the ChRIS store.
2. Upload your plugin to the ChRIS store.
3. Log into ChRIS (same account username + password as from the Store).
4. See running job status in ChRIS_ui.
5. Download results (.csv) from ChRIS_ui.

## Resources

- http://fnndsc.childrens.harvard.edu/cnichallenge/
- https://github.com/FNNDSC/pl-cni_challenge
- https://github.com/FNNDSC/ChRIS_ultron_backEnd/wiki/MICCAI-Work-Flow-(WIP)
