const express = require('express');
const httpProxy = require('http-proxy');
const dotenv = require('dotenv');
const colors = require('colors');
const print = require('./print');
const Cube = require('./cube');

// we will find this out in an asynchronous block
let feedId = 0;

dotenv.config();
const STORE_URL = process.env.REAL_STORE_URL;
const cube = new Cube(process.env.CUBE_URL, process.env.CUBE_USER);

const app = express();
const proxy = httpProxy.createProxyServer();

/**
 * Arguments to use when running the user-submitted plugin.
 */
const SUBMISSION_RUN_CONFIGURATION = [
  {name: 'dummyInt', value: 105},
  {name: 'sleepLength', value: '5'},
  {name: 'b_ignoreInputDir', value: true}
];

/**
 * Evaluator plugin is the "leaf" which reads the results from the uploaded plugin's feed
 * and spits out a .CSV.
 * This plugin does not exist yet, for now we are mocking it with pl-simpledsapp
 */
const EVALUATOR_RUN_CONFIGURATION = [
  {name: 'b_ignoreInputDir', value: true},
  {name: 'dummyFloat', value: 2.2}
];


// proxy all other endpoints besides /users/ (without any modification)
app.all("/api/*", (req, res) => {
  print( 'vanilla proxy to STORE', req);
  proxy.web(req, res, {target: STORE_URL});
});

// detect when proxy hits the /plugins/ endpoint.
// if plugin was successfully uploaded to the Store,
// then fire a job to register it in ChRIS and run a feed.
proxy.on('proxyRes', (proxyRes, req) => {
  if (req.method !== 'POST' && req.path !== '/api/v1/plugins/') {
    return;
  }
  if (proxyRes.statusCode !== 201 || proxyRes.statusMessage !== 'Created') {
    print(colors.bold(colors.red('Store upload failed: '
      + `${proxyRes.statusCode} ${proxyRes.statusMessage}`)));
    return;
  }
  const buffer = [];
  proxyRes.on('data', chunk => buffer.push(chunk));
  proxyRes.on('end', () => {
    const body = JSON.parse(Buffer.concat(buffer).toString());
    handleSuccessfulPluginUpload(body);
  });
});

print(colors.dim('process started'));
// find the FS plugin, then start the server
cube.searchFeed(process.env.FEED_NAME).then(feed => {
  feedId = feed.id;
  print(`found feed for "${feed.name}" - id=${feedId}`);
  const PORT = process.env.port || 8011;
  app.listen(PORT);
  print(`listening on http://localhost:${PORT}/api/v1/`);
}).catch(e => {
  print("couldn\'t find pre-existing feed for FS plugin "
    + `"${process.env.FS_PLUGIN_NAME}"`);
  console.log(e);
});

/**
 * Register the plugin into CUBE and create a feed from it.
 *
 * @param storeResponse response from Store after successful plugin upload
 */
async function handleSuccessfulPluginUpload(storeResponse) {
  const pluginName = getKeyFromList(storeResponse, 'data', 'name', 'value', 'name');
  await cube.registerPlugin(pluginName);
  await runSubmission(pluginName);
}

/**
 * Attaches the plugin to an existing feed after the FS app pl-test_data_generator
 * and then adds the evaluator plugin after the submitted plugin.
 *
 * @param pluginName name of plugin
 * @return {Promise<void>}
 */
async function runSubmission(pluginName) {
  print(`creating feed for "${pluginName}"`);
  const feedInfo = await cube.createFeed(pluginName, SUBMISSION_RUN_CONFIGURATION, feedId);
  await cube.createFeed(process.env.EVALUATOR_NAME, EVALUATOR_RUN_CONFIGURATION, feedInfo.id);
}


/**
 * Helper function for the annoying application/vnd.collection+json.
 *
 * @param response response from server
 * @param listName name of outer list object to search in
 * @param keyName name of the key
 * @param valueName name of the value you want
 * @param targetKey which key to search for
 * @return {*}
 */
function getKeyFromList(response, listName, keyName, valueName, targetKey) {
  for (const data of response.collection.items[0][listName]) {
    if (data[keyName] === targetKey) {
      return data[valueName];
    }
  }
  throw Error(`'${key}' not found in ${JSON.stringify(response)}`);
}
