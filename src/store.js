const print = require('./print');
const colors = require('colors');

/**
 * UploadDetector connects the proxy server in front of ChRIS_store with CUBE
 * and handles automatic registration and feed creation for submitted plugins.
 */
class UploadDetector {
  /**
   * @param cube CUBE connection
   * @param feedId ID of which feed in CUBE which to run submissions under
   */
  constructor(cube, feedId, evaluatorName, submissionRunData, evaluatorRunData) {
    this.cube = cube;
    this.feedId = feedId;
    this.evaluatorName = evaluatorName;
    this.submissionRunData = submissionRunData;
    this.evaluatorRunData = evaluatorRunData;
  }

  /**
   * Register the plugin into CUBE and create a feed from it.
   *
   * @param storeResponse response from Store after successful plugin upload
   */
  async registerAndRun(storeResponse) {
    const pluginName = getKeyFromList(storeResponse, 'data', 'name', 'value', 'name');
    await this.cube.registerPlugin(pluginName);
    await this.runSubmission(pluginName);
  }

  /**
   * Attaches the plugin to an existing feed after the FS app pl-test_data_generator
   * and then adds the evaluator plugin after the submitted plugin.
   *
   * @param pluginName name of plugin
   * @return {Promise<void>}
   */
  async runSubmission(pluginName) {
    print(`creating feed for "${pluginName}"`);
    const feedInfo = await this.cube.createFeed(pluginName, this.submissionRunData, this.feedId);
    await this.cube.createFeed(this.evaluatorName, this.evaluatorRunData, feedInfo.id);
  }

  /**
   * Configure the http-proxy object to listen for successful plugin uploads.
   *
   * Following successful plugin upload to ChRIS_Store, sending it to CUBE
   * happens asynchronously. The feed will not be immediately available
   * in CUBE, instead the client can expect the feed to appear in CUBE
   * shortly (assuming integration tests pass and CUBE is healthy).
   *
   * @param proxy proxy server object
   */
  attachTo(proxy) {
    proxy.on('proxyRes', (proxyRes, req) => {
      if (req.method !== 'POST' || req.path !== '/api/v1/plugins/') {
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
        this.registerAndRun(body);
      });
    });
  }

  /**
   * Check that the submitted plugin's JSON representation allows for
   * the plugin to be run by pre-defined parameters.
   *
   * Typically, challenge submissions are run without additional options
   * (aside from the positional arguments /incoming /outgoing). In this
   * case, this function simply checks that none of the parameters are
   * declared with
   *
   *     "optional": false
   *
   * This function should be used as middleware on the
   *
   * POST /api/v1/plugins/
   *
   * endpoint, prior to proxying.
   *
   * @param req request
   * @param res response
   * @param next next middleware to call
   */
  static validatePlugin(req, res, next) {
    // TODO
    next();
  }
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
  throw Error(`'${keyName}' not found in ${JSON.stringify(response)}`);
}

module.exports = UploadDetector;
