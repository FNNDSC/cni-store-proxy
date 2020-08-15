const express = require('express');
const httpProxy = require('http-proxy');
const colors = require('colors');

const PORT = 8011;
const STORE_URL = 'http://localhost:8010';
const CHRIS_URL = 'http://localhost:8000';

const EVALUATOR_PLUGIN = 'fnndsc/pl-simpledsapp:latest';

const app = express();
const proxy = httpProxy.createProxyServer();

// create an account on BOTH ChRIS store AND CUBE.
app.post('/api/v1/users/', (req, res) => {
  // TODO
  proxy.web(req, res, {target: STORE_URL});
});

app.all("/api/*", (req, res) => {
  log(req, 'proxied');
  proxy.web(req, res, {target: STORE_URL});
});

app.listen(PORT);
console.log(`listening on http://localhost:${PORT}/api/v1/`);

function log(req, info) {
  if (!info) {
    info = '';
  }

  let strMethod;
  switch (req.method) {
    case 'GET':
      strMethod = `${colors.green(req.method)}`;
      break;
    case 'POST':
      strMethod = `${colors.blue(req.method)}`;
      break;
    default:
      strMethod = colors.cyan(req.method);
  }

  console.log(colors.dim(`[ ${new Date().toISOString()} ]`)
    + ` ${req.ip} ${strMethod} ${colors.italic(req.originalUrl)}: ${info}`);
}
