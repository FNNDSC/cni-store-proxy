const express = require('express');
const httpProxy = require('http-proxy');
const streamifier = require('streamifier');
const axios = require('axios');
const colors = require('colors');

const PORT = 8011;
const STORE_URL = 'http://localhost:8010';
const CUBE_HOST = 'localhost:8000';
const CUBE_URL = 'http://' + CUBE_HOST;

const EVALUATOR_PLUGIN = 'fnndsc/pl-simpledsapp:latest';

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
  log(req, 'sending to both ChRIS_Store and CUBE');
  // calling STORE after CUBE for reliability
  // ensuring CUBE account creation is successful
  createCUBEUser(req)
    .then(() => // need to stream request body because it was consumed by JSON middleware
      proxy.web(req, res, {target: STORE_URL, buffer: streamifier.createReadStream(req.rawBody)})
    ).catch(axiosError => {
      const msg = axiosError.message ? colors.bold(axiosError.message) : axiosError;
      log(colors.bgWhite(colors.red(colors.bold('CUBE <-- '))), msg);

      res.status(500);
      res.send('Internal error creating user account on CUBE.');
    });
});

app.all("/api/*", (req, res) => {
  log(req, 'vanilla proxy to STORE');
  proxy.web(req, res, {target: STORE_URL});
});

proxy.on('proxyRes', (proxyRes, req, res) => {
  if (req.path !== '/api/v1/plugins/') {
    return;
  }
  if (proxyRes.statusCode !== 201 || proxyRes.statusMessage !== 'Created') {
    log(colors.bold(colors.red('Store upload failed: '
      + `${proxyRes.statusCode} ${proxyRes.statusMessage}`)));
    return;
  }
  const buffer = [];
  proxyRes.on('data', chunk => buffer.push(chunk));
  proxyRes.on('end', () => {
    const body = JSON.parse(Buffer.concat(buffer).toString());
    registerAndRunPlugin(body);
  });
});

app.listen(PORT);
console.log(`listening on http://localhost:${PORT}/api/v1/`);

// create user account on CUBE and cache their credentials
function createCUBEUser(req) {
  const forwardReq = {
    method: req.method,
    baseURL: CUBE_URL,
    url: req.route.path,
    headers: req.headers,
    data: req.body,
    timeout: 5000
  };
  forwardReq.headers.host = CUBE_HOST;
  log(colors.yellow('CUBE --> '));
  console.dir(forwardReq);
  return axios(forwardReq).then(res => {
    log(colors.green('CUBE <-- '));
    console.dir(res);
    return res;
  }).then(res => {
    // maybe instead, POST /api/v1/auth-token/
    // cache credentials so later we can create feed as the user
    // for (const data of req.body.template.data) {
    //   if (data.name === 'password')
    //     db.lastPassword = data.value;
    //   else if (data.name === 'username')
    //     db.lastUsername = data.value;
    // }
    // console.dir(db);
  });
}

function registerAndRunPlugin(storeResponse) {
  console.dir(storeResponse);
}

// colorful debugging print command with timestamps
function log(req, info) {
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
