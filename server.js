const express = require('express');
const httpProxy = require('http-proxy');
const axios = require('axios');
const dotenv = require('dotenv');
const colors = require('colors');
const { exec } = require('child_process');

dotenv.config();
const PORT = process.env.port || 8011;
const STORE_URL = process.env.REAL_STORE_URL;
const CUBE_URL = process.env.CUBE_URL;
const CUBE_AUTH = {
  username: process.env.CUBE_USER.split(':')[0],
  password: process.env.CUBE_USER.split(':')[1]
};

/**
 * When a plugin is submitted, it is attached to a pre-existing feed
 * where the FS plugin pl-test_data_generator was ran already.
 *
 * Another option to consider would be to rerun the FS plugin for every user submission.
 */
const SINGLE_FEED_ID = 1;
/**
 * Argument to pass for feed creation.
 */
const SUBMISSION_RUN_CONFIGURATION = [
  {name: 'dummyInt', value: 105},
  {name: 'sleepLength', value: '5'}
]

/**
 * Evaluator plugin is the "leaf" which reads the results from the uploaded plugin's feed
 * and spits out a .CSV.
 * This plugin does not exist yet, for now we are mocking it with pl-simpledsapp
 */
const EVALUATOR_PLUGIN = process.env.EVALUATOR_NAME;
const EVALUATOR_RUN_CONFIGURATION = [
  {name: 'b_ignoreInputDir', value: true},
  {name: 'dummyFloat', value: 2.2}
]

const app = express();
const proxy = httpProxy.createProxyServer();

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

app.listen(PORT);
console.log(`listening on http://localhost:${PORT}/api/v1/`);

/**
 * Register the plugin into CUBE and create a feed from it.
 *
 * @param storeResponse response from Store after successful plugin upload
 */
async function handleSuccessfulPluginUpload(storeResponse) {
  const pluginName = getKeyFromList(storeResponse, 'data', 'name', 'value', 'name');
  print(`uploading "${pluginName}" to CUBE...`);
  await registerPluginToCUBE(pluginName);
  await runSubmission(pluginName);
}

/**
 * Run external script to register the plugin in CUBE.
 *
 * @param pluginName
 */
function registerPluginToCUBE(pluginName) {
  return new Promise(((resolve, reject) =>
    exec('./upload_plugin.sh ' + pluginName, (error, stdout, stderr) => {
      if (stdout) {
        print(colors.green('CUBE <-- (stdout)'));
        console.log(stdout);
      }
      if (stderr) {
        print(colors.red('CUBE <-- (stderr)'));
        console.log(stderr);
      }
      if (error) {
        reject(error);
      }
      resolve();
    })
  ));
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
  const feedInfo = await createFeed(pluginName, SUBMISSION_RUN_CONFIGURATION, SINGLE_FEED_ID);
  console.dir(feedInfo);
  // await createFeed(EVALUATOR_PLUGIN, EVALUATOR_RUN_CONFIGURATION, feedInfo.id);
}

/**
 * Run a plugin.
 *
 * @param pluginName name of plugin to run
 * @param runConfiguration arguments to run plugin with
 * @param previousId if given, new (DS plugin) node is appended to the ID
 * @return {Promise<AxiosResponse>}
 */
async function createFeed(pluginName, runConfiguration, previousId) {
  if (Number.isInteger(previousId)) {
    previousId = { name: 'previous_id', value: previousId };
    runConfiguration = [...runConfiguration, previousId];
  }
  const url = await getPluginInstancesUrl(pluginName);
  const run = await axios.post(url,
    {
      template: {
        data: runConfiguration
      }
    },
    {
    auth: CUBE_AUTH,
    headers: {
      'content-type': 'application/vnd.collection+json'
    }
  });
  return run.data;
}

/**
 * Look up the endpoint to call for creating a feed from the plugin name.
 *
 * E.g. "pl-dircopy" --> "http://localhost:8000/api/v1/plugins/13/instances/"
 *
 * @param pluginName name of plugin
 * @return {Promise<string>}
 */
async function getPluginInstancesUrl(pluginName) {
  const search = await axios({
    method: 'GET',
    baseURL: CUBE_URL,
    url: '/api/v1/plugins/search/',
    params: {
      name: pluginName
    },
    auth: CUBE_AUTH
  });
  for (const uploadedPlugin of search.data.results) {
    if (uploadedPlugin.name === pluginName) {
      return uploadedPlugin.instances;
    }
  }
  throw Error(`can't find "${pluginName}" in ${JSON.stringify(search.data)}`);
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

/**
 * Colorful debugging print command with timestamps.
 * @param info message to print
 * @param req request object, if available
 */
function print(info, req) {
  info = info ? ' ' + info : '';
  let strReq = req || '';
  if (req && req.method) {
    switch (req.method) {
      case 'GET':
        strReq = `${colors.green(req.method)}`;
        break;
      case 'POST':
        strReq = `${colors.blue(req.method)}`;
        break;
      default:
        strReq = colors.cyan(req.method);
    }
    strReq = `${req.ip} ${strReq} ${colors.italic(req.originalUrl)}:`;
  }
  console.log(colors.dim(`[ ${new Date().toISOString()} ] `) + strReq + info);
}
