const colors = require('colors');
const print = require('./print');
const app = require('./app');

print(colors.dim('process started'));

app().then((app) => {
  const server = app.listen(process.env.PORT || 8011, () => {
    const url = `http://localhost:${server.address().port}/api/v1/`;
    print(colors.cyan('listening on ' + colors.underline(url)));
  });
});
