const express = require('express');
const httpProxy = require('http-proxy');
const dotenv = require('dotenv');
const colors = require('colors');
const print = require('./print');
const Cube = require('./cube');
const UploadDetector = require('./store');

dotenv.config();
const STORE_URL = process.env.REAL_STORE_URL;

const cube = new Cube(
  process.env.CUBE_URL,
  process.env.CUBE_USERNAME,
  process.env.CUBE_PASSWORD
);
const app = express();
const proxy = httpProxy.createProxyServer();

// send everything on /api/ to the ChRIS_store backend
app.all("/api/*", (req, res) => {
  print( colors.dim('--> ChRIS_store'), req);
  proxy.web(req, res, {target: STORE_URL});
});


print(colors.dim('process started'));
// find the FS plugin, then start the server
cube.searchFeed(process.env.FEED_NAME).then(feed => {
  print(colors.dim(`found feed for "${feed.name}" - id=${feed.id}`));

  new UploadDetector(cube, feed.id).attachTo(proxy);

  const PORT = process.env.port || 8011;
  app.listen(PORT);
  print(colors.cyan('listening on ' + colors.underline(`http://localhost:${PORT}/api/v1/`)));
}).catch(e => {
  print("couldn\'t find pre-existing feed for FS plugin "
    + `"${process.env.FS_PLUGIN_NAME}"`);
  console.log(e);
});

