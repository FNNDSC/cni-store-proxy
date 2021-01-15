const express = require('express');
const httpProxy = require('http-proxy');
const colors = require('colors');
const print = require('./print');
const Cube = require('./cube');
const UploadDetector = require('./store');
const SubmissionResultsProxy = require('./results');
const config = require('./config');

const cube = new Cube(
  config.cube.url,
  config.cube.username,
  config.cube.password
);

const app = express();
const proxy = httpProxy.createProxyServer();

if (process.env.CNI_BACKEND_TRUST_PROXY) {
  app.enable('trust proxy');
}

app.post('/api/v1/plugins/', UploadDetector.validatePlugin);

// send everything on /api/ to the ChRIS_store backend
app.all('/api/*', (req, res) => {
  print(colors.dim('--> ChRIS_store'), req);
  proxy.web(req, res, {target: config.chrisStore.url});
});


app.use('/cni', (new SubmissionResultsProxy(cube, config.chrisStore.url, app.get('trust proxy'))).router);

let fsInstanceId = null;

/**
 * Get a singleton instance of the express app.
 * @return {Promise<Express>} express app
 */
async function getApp() {
  if (!fsInstanceId) {
    // find the FS plugin, then start the server
    const fsPlugin = await cube.searchPlugin(config.plugins.fs.name);
    const inst = await cube.get({ url: fsPlugin.instances });
    fsInstanceId = inst.results[0].id;

    print(colors.dim(`found ancestor plugin "${fsPlugin.name}" - id=${fsInstanceId}`));
    (new UploadDetector(
      cube, fsInstanceId,
      config.plugins.evaluator.name,
      config.runArgs.submission, config.runArgs.evaluator
    )).attachTo(proxy);
  }
  return app;
}

module.exports = getApp;
