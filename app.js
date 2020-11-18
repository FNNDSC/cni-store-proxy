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

let feed = null;

/**
 * Get a singleton instance of the express app.
 * @return {Promise<Express>} express app
 */
async function getApp() {
  if (!feed) {
    // find the FS plugin, then start the server
    feed = await cube.searchFeed(process.env.FEED_NAME);
    print(colors.dim(`found feed for "${feed.name}" - id=${feed.id}`));
    new UploadDetector(cube, feed.id).attachTo(proxy);
  }
  return app;
}

module.exports = getApp;
