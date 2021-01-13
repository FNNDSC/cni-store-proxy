const axios = require('axios');
const { exec } = require('child_process');
const print = require('./print');
const colors = require('colors');

/**
 * CUBE client.
 */
class Cube {

  constructor(url, username, password) {
    this.url = url;
    this._user = {
      username: username,
      password: password
    }
    this._getAxiosConfig = {
      method: 'GET',
      auth: this._user,
      headers: {
        /*
         * axios sets "Accept: application/json" by default
         * though we're specifying it just in case
         * since without the header, application/vnd.collection+json
         * is returned instead
         */
        accept: 'application/json'
      }
    };
  }

  /**
   * Run external script to register the plugin in CUBE.
   * The specified plugin must already have been uploaded to the ChRIS Store.
   *
   * @param pluginName plugin name
   * @return {Promise}
   */
  registerPlugin(pluginName) {
    print(`registering "${pluginName}" into CUBE...`);
    return new Promise(((resolve, reject) =>
        exec('./plugin2cube.sh ' + pluginName, (error, stdout, stderr) => {
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
   * Run a plugin.
   *
   * previousId can be undefined to create a new top-level feed (FS plugin).
   * Or it can be specified as a positive integer to append node to existing feed (DS plugin).
   *
   * @param pluginName name of plugin to run
   * @param runConfiguration arguments to run plugin with
   * @param previousId if given, new (DS plugin) node is appended to the ID
   * @return {Promise} response from CUBE after feed creation
   */
  async createFeed(pluginName, runConfiguration, previousId) {
    if (Number.isInteger(previousId)) {
      previousId = { name: 'previous_id', value: previousId };
      runConfiguration = [...runConfiguration, previousId];
    }
    const url = (await this.searchPlugin(pluginName)).instances;
    printTx('POST', url);
    const run = await axios.post(
      url,
      {
        template: {
          data: runConfiguration
        }
      },
      {
        auth: this._user,
        headers: {
          'content-type': 'application/vnd.collection+json'
        }
      });
    return run.data;
  }

  /**
   * Query for information about a plugin.
   *
   * @param pluginName plugin name
   * @return {Promise} result from /api/v1/plugins/search/
   */
  async searchPlugin(pluginName) {
    const search = await this.get({
      url: '/api/v1/plugins/search/',
      params: {
        name: pluginName
      }
    });
    for (const uploadedPlugin of search.results) {
      if (uploadedPlugin.name === pluginName) {
        return uploadedPlugin;
      }
    }
    throw Error(`can't find plugin "${pluginName}" in ${JSON.stringify(search)}`);
  }

  async searchFeed(feedName) {
    const search = await this.get({ url: '/api/v1/search/' });
    for (const feed of search.results) {
      if (feed.name === feedName
        && feed.creator_username === this._user.username) {
        return feed;
      }
    }
    throw Error(`can't find feed "${feedName}"`
      + ` by creator "${this._user.username}"`
      + ` in ${JSON.stringify(search)}`);
  }

  /**
   * Do a GET request.
   *
   * @param axiosConfig
   */
  async get(axiosConfig) {
    axiosConfig = {
      ...this._getAxiosConfig,
      ...(axiosConfig || {})
    };
    if (!axiosConfig.url.startsWith('http')) {
      axiosConfig.baseURL = this.url;
    }
    printTx('GET', (axiosConfig.baseURL || '') + axiosConfig.url);
    const result = await axios(axiosConfig);
    return result.data;
  }
}

function printTx(method, data) {
  if (!data) {
    data = method;
    method = '';
  }
  else {
    method = colors.magenta(method) + ' ';
  }
  print(colors.green('CUBE --> ') + method + data);
}

module.exports = Cube;
