const colors = require('colors');
const express = require('express');
const print = require('./print');
const getCniEndpoints = require('./app');

print(colors.dim('process started'));

const app = express();

if (process.env.CNI_BACKEND_CORS) {
  const cors = require('cors');
  app.use(cors({ origin: process.env.CNI_BACKEND_CORS }));
}

if (process.env.CNI_BACKEND_TRUST_PROXY) {
  app.enable('trust proxy');
}

getCniEndpoints().then((cniEndpoints) => {
  app.use(cniEndpoints);
  const server = app.listen(process.env.PORT || 8011, () => {
    const url = `http://localhost:${server.address().port}/api/v1/`;
    print(colors.cyan('listening on ' + colors.underline(url)));
  });
});
