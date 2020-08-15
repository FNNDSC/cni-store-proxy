const express = require('express');
const httpProxy = require('http-proxy');
const axios = require('axios');
const colors = require('colors');

const PORT = 8011;
const STORE_URL = 'http://localhost:8010';
const CUBE_HOST = 'localhost:8000';
const CUBE_URL = 'http://' + CUBE_HOST;

const EVALUATOR_PLUGIN = 'fnndsc/pl-simpledsapp:latest';

const app = express();
app.use(express.json({type: 'application/vnd.collection+json'}));
const proxy = httpProxy.createProxyServer();

// create an account on BOTH ChRIS store AND CUBE.
app.post('/api/v1/users/', (req, res) => {
  log(req, 'sent to both ChRIS_Store and CUBE');
  forwardToCube(req);
  proxy.web(req, res, {target: STORE_URL});
});

app.all("/api/*", (req, res) => {
  proxy.web(req, res, {target: STORE_URL});
});

app.listen(PORT);
console.log(`listening on http://localhost:${PORT}/api/v1/`);

async function forwardToCube(req) {
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

  try {
    const res = await axios(forwardReq);
    log(colors.green('CUBE <-- '));
    console.dir(res);
  } catch (e) {
    const msg = e.message ? colors.bold(e.message) : e;
    log(colors.bgWhite(colors.red(colors.bold('CUBE <-- '))), msg);
  }
}

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
