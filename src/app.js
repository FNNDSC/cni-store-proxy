const express = require('express');
const httpProxy = require('http-proxy');
const dotenv = require('dotenv');
const path = require('path');
const colors = require('colors');
const print = require('./print');
const Cube = require('./cube');
const UploadDetector = require('./store');

dotenv.config();
dotenv.config({path: path.resolve(process.cwd(), 'parameters/plugins.env')});

const STORE_URL = process.env.REAL_STORE_URL;

const cube = new Cube(
  process.env.CUBE_URL,
  process.env.CUBE_USERNAME,
  process.env.CUBE_PASSWORD
);

const app = express();
const proxy = httpProxy.createProxyServer();

app.post('/api/v1/plugins/', UploadDetector.validatePlugin);

// send everything on /api/ to the ChRIS_store backend
app.all('/api/*', (req, res) => {
  print( colors.dim('--> ChRIS_store'), req);
  proxy.web(req, res, {target: STORE_URL});
});

let fsInstanceId = null;

/**
 * Get a singleton instance of the express app.
 * @return {Promise<Express>} express app
 */
async function getApp() {
  if (!fsInstanceId) {
    // find the FS plugin, then start the server
    const fsPlugin = await cube.searchPlugin(process.env.FS_PLUGIN_NAME);
    const inst = await cube.get({ url: fsPlugin.instances });
    fsInstanceId = inst.results[0].id;

    print(colors.dim(`found ancestor plugin "${fsPlugin.name}" - id=${fsInstanceId}`));
    new UploadDetector(cube, fsInstanceId).attachTo(proxy);
  }
  return app;
}

module.exports = getApp;
