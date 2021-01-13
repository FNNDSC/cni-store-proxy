const axios = require('axios');
const print = require('./print');
const colors = require('colors');
const {
  NotLoggedIntoStoreError, SubmissionNotFoundError, CniCubeIntegrityError
} = require('./errors');

// noinspection EqualityComparisonWithCoercionJS
class SubmissionResultsProxy {
  constructor(cube, storeUrl) {
    this.cube = cube;
    this.storeUrl = storeUrl;
  }

  /**
   * Handle the client's request, which was made to this server
   * (the cni-store-proxy) by making a query to CUBE about a
   * plugin instance given the ID of that plugin in the ChRIS store.
   *
   * This method does routing under the /cni/<N>/* space.
   *
   * @param req request
   * @param res response
   * @return {Promise<void>}
   */
  async cubeImpersonation(req, res) {
    let evalInstId;
    try {
      evalInstId = await this.getEvaluation(req);
    } catch (e) {
      const debugMessage = `${colors.italic(req.originalUrl)} -> ${colors.red(e.message)}`;
      if (e instanceof NotLoggedIntoStoreError) {
        print(debugMessage);
        res.status(401).send(e.message);
        return;
      }
      if (e instanceof SubmissionNotFoundError) {
        print(debugMessage);
        res.status(400).send(e.message);
        return;
      }
      throw e;
    }
    if (req.params.tail === '') {
      const feedback = await this.getLimitedInstancesInfo(`/api/v1/plugins/instances/${evalInstId}`);
      res.json(feedback);
    }
    else {
      res.send('your tail: ' + req.params.tail);
    }
  }

  /**
   * Authorize with the ChRIS_store and discover the
   * instance ID of the evaluator plugin.
   *
   * (In valid states) there is a one-to-one correspondence
   * between plugins which were uploaded via cni-store-proxy
   * and feed instances of that plugin in CUBE.
   *
   * @param req request
   */
  async getEvaluation(req) {
    const pinfo = colors.dim(`(${Date.now()})${colors.italic(req.originalUrl)} - `);

    const ownedPluginMetasHref = await this.getOwnedPluginMetaHref(req);
    const pluginName = await this.getPluginName(req, ownedPluginMetasHref);

    const feedId = await this.getEvaluatorId(pluginName);
    print(`${pinfo} plugin_name=${colors.bold(pluginName)} evaluator instance id=${feedId}`);
    return feedId;
  }

  /**
   * Get the href for owned_plugin_metas.
   * If client is not logged in, NotLoggedInError is raised.
   *
   * @param req
   * @return {Promise<string>}
   */
  async getOwnedPluginMetaHref(req) {
    if (!req || !req.headers || !req.headers.authorization) {
      throw new NotLoggedIntoStoreError('Missing Authorization header');
    }
    try {
      const checkStoreLogin = await axios.get(
        this.storeUrl + '/api/v1/',
        {
          headers: {
            accept: 'application/json',
            authorization: req.headers.authorization,
          }
        });
      return checkStoreLogin.data.collection_links.owned_plugin_metas;
    } catch (e) {
      // failed authorization expects a 401 status
      if (!e || !e.response || e.response.status !== 401) {
        throw e;
      }
      // if we can recognize that the store responded with an
      // error message, send it back to client
      if (e.response && e.response.data && e.response.data.detail) {
        throw new NotLoggedIntoStoreError(e.response.data.detail);
      }
      // else simply produce our own error message
      throw new NotLoggedIntoStoreError('bad Authorization');
    }
  }

  /**
   * Check to see whether the current user owns the plugin which
   * they are querying for. If so, return the name of that plugin.
   *
   * @param req client request
   * @param ownedPluginMetasHref href of owned_plugin_metas
   * @throws SubmissionNotFoundError if given ID in req is not owned by user
   * @return {Promise<string>}
   */
  async getPluginName(req, ownedPluginMetasHref) {
    // TODO pagination
    const ownedPlugins = await axios.get(
      ownedPluginMetasHref,
      {
        headers: {
          accept: 'application/json',
          authorization: req.headers.authorization,
        }
      }
    );

    for (const pluginMeta of ownedPlugins.data.results) {
      if (pluginMeta.id == req.params.id) {
        return pluginMeta.name;
      }
    }

    throw new SubmissionNotFoundError('You do not own plugin ID ' + req.params.id);
  }

  /**
   * Find the instance ID of the evaluator plugin.
   *
   * @param pluginName name of submission plugin
   * @return {Promise<number>}
   */
  async getEvaluatorId(pluginName) {
    const instData = await this.cube.get({
      url: (await this.cube.searchPlugin(pluginName)).instances
    });

    if (instData.results.length === 0) {
      throw new CniCubeIntegrityError(`no feeds found for "${pluginName}"`);
    }

    const instance = instData.results[0];
    const descendantsData = await this.cube.get({
      url: instance.descendants
    });
    for (const desc of descendantsData.results) {
      if (desc.previous_id === instance.id) {
        // here we could also do some basic assertions, e.g.
        // desc.plugin_name === "cni-evaluator"
        return desc.id;
      }
    }
    throw new CniCubeIntegrityError('evaluator not found in ' + instance.descendants);
  }

  /**
   * GET request to CUBE /api/v1`/plugins/instances/<N>/ but with a subset
   * of keys returned.
   *
   * @param href instances href
   * @return {Promise<{*>}
   */
  async getLimitedInstancesInfo(href) {
    const inst = await this.cube.get({
      url: href
    });
    return {
      files: inst.files, // TODO
      summary: inst.summary,
      status: inst.status,
      plugin_name: inst.plugin_name,
      plugin_version: inst.plugin_version
    }
  }
}

module.exports = SubmissionResultsProxy;
