const colors = require('colors');
const print = require('./print');
const app = require('./app');

print(colors.dim('process started'));

app().then((app) => {
  const server = app.listen(process.env.PORT, () => {
    const url = `http://localhost:${server.address().port}/api/v1/`;
    print(colors.cyan('listening on ' + colors.underline(url)));
  });
}).catch((e) => {
  print("couldn\'t find pre-existing feed for FS plugin "
    + `"${process.env.FS_PLUGIN_NAME}"`);
  console.log(e);
});
