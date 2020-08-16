const express = require('express');
const httpProxy = require('http-proxy');
const streamifier = require('streamifier');
const axios = require('axios');
const dotenv = require('dotenv');
const colors = require('colors');
const { exec } = require('child_process');

dotenv.config();
const PORT = process.env.port || 8011;
const STORE_URL = process.env.REAL_STORE_URL;
const CUBE_URL = process.env.CUBE_URL;
// hacky way to turn "http://localhost:8000" -> "localhost:8000"
const CUBE_EXPECTED_HOST = CUBE_URL.split('://')[0];

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
const EVALUATOR_PLUGIN = 'fnndsc/pl-simpledsapp:latest';
const EVALUATOR_RUN_CONFIGURATION = [
  {name: 'b_ignoreInputDir', value: true},
  {name: 'dummyFloat', value: 2.2}
]

const app = express();
const proxy = httpProxy.createProxyServer();

// capture request body only on /users
app.use('/api/v1/users/', express.json({
  type: 'application/vnd.collection+json',
  // needed to expose body to proxy
  verify: (req, res, buf) => req.rawBody = buf
}));

// create an account on BOTH ChRIS store AND CUBE.
app.post('/api/v1/users/', (req, res) => {
  print(req, 'sending to both ChRIS_Store and CUBE');
  // calling CUBE before proxying the request to STORE
  // ensuring that CUBE account creation is successful
  createCUBEUser(req)
    .then(() => // need to stream request body because it was consumed by JSON body-parse middleware
      proxy.web(req, res, {target: STORE_URL, buffer: streamifier.createReadStream(req.rawBody)})
    ).catch(axiosError => {
      const msg = axiosError.message ? colors.bold(axiosError.message) : axiosError;
      print(colors.bgWhite(colors.red(colors.bold('CUBE <-- '))), msg);

      res.status(500);
      res.send('Internal error creating user account on CUBE.');
    });
});

// proxy all other endpoints besides /users/ (without any modification)
app.all("/api/*", (req, res) => {
  print(req, 'vanilla proxy to STORE');
  proxy.web(req, res, {target: STORE_URL});
});

// detect when proxy hits the /plugins/ endpoint.
// if plugin was successfully uploaded to the Store,
// then fire a job to register it in ChRIS and run a feed.
proxy.on('proxyRes', (proxyRes, req) => {
  if (req.path !== '/api/v1/plugins/') {
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

// create user account on CUBE and share with them the feed.
function createCUBEUser(req) {
  const forwardReq = {
    method: req.method,
    baseURL: CUBE_URL,
    url: req.route.path,
    headers: req.headers,
    data: req.body,
    timeout: 5000
  };
  forwardReq.headers.host = CUBE_EXPECTED_HOST;
  print(colors.yellow('CUBE --> '));
  console.dir(forwardReq);
  return axios(forwardReq).then(res => {
    print(colors.green('CUBE <-- '));
    console.dir(res);
    return res;
  }).then(res => {
    getKeyFromList(res, 'data', 'name', 'value', 'username')
    // TODO share root feed with user
    // you can cache their credentials here, if needed
    // so that we can create the feed as the user.
    // maybe instead, POST /api/v1/auth-token/
    // for (const data of req.body.template.data) {
    //   if (data.name === 'password')
    //     db.lastPassword = data.value;
    //   else if (data.name === 'username')
    //     db.lastUsername = data.value;
    // }
    // console.dir(db);
  });
}

// helper function for the annoying application/vnd.collection+json
function getKeyFromList(response, listName, keyName, valueName, targetKey) {
  for (const data of response.collection.items[0][listName]) {
    if (data[keyName] === targetKey) {
      return data[valueName];
    }
  }
  throw Error(`'${key}' not found in ${JSON.stringify(response)}`);
}

// register the plugin into CUBE and create a feed from it
function handleSuccessfulPluginUpload(storeResponse) {
  const pluginName = getKeyFromList(storeResponse, 'data', 'name', 'value', 'name');
  print(`uploading "${pluginName}" to CUBE...`);
  registerPluginToCUBE(pluginName);
  runSubmission(pluginName);
}

// as far as I know, there is no way to register a plugin via REST API
// (it is possible from an HTML webpage at /chris-admin/)
// this function might involve a synchronous (i.e. blocking) network operation!
function registerPluginToCUBE(plugin) {
  exec('./upload_plugin.sh ' + plugin, (error, stdout, stderr) => {
    if (error) {
      throw error;
    }
    if (stdout) {
      print(colors.green('CUBE <-- (stdout)'));
      console.log(stdout);
    }
    if (stderr) {
      print(colors.red('CUBE <-- (stderr)'));
      console.log(stderr);
    }
  });
}

// Attaches the plugin to an existing feed
// after the FS app pl-test_data_generator
// and then adds the evaluator plugin after the given plugin.
async function runSubmission(pluginName) {
  print(`creating feed for "${pluginName}"`);
  const feedInfo = await appendToFeed(pluginName, SINGLE_FEED_ID, SUBMISSION_RUN_CONFIGURATION);
  console.log(feedInfo);
  appendToFeed(EVALUATOR_PLUGIN, feedInfo.id, EVALUATOR_RUN_CONFIGURATION);
}

async function appendToFeed(pluginName, runConfiguration, previousId) {
  if (Number.isInteger(previousId)) {
    previousId = { name: 'previous_id', value: previousId };
    runConfiguration = [...runConfiguration, previousId];
  }
  return await axios.post({
    url: await getPluginInstancesUrl(pluginName),
    headers: {
      'content-type': 'application/vnd.collection+json'
    },
    data: {
      template: {
        data: runConfiguration
      }
    }
  });
}

async function getPluginInstancesUrl(plugin) {
  const searchResults = await axios.get({
    baseURL: CUBE_URL,
    url: '/api/v1/plugins/search/',
    params: {
      name: plugin
    }
  });
  return getKeyFromList(searchResults, 'links', 'rel', 'href', 'instances');
}

// colorful debugging print command with timestamps
function print(req, info) {
  info = info ? ' ' + info : '';
  let strReq = req;
  if (req.method) {
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
