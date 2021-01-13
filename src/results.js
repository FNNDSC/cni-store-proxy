const axios = require('axios');
const print = require('./print');
const colors = require('colors');
const express = require('express');

const {
  NotLoggedIntoStoreError,
  SubmissionNotFoundError,
  CniCubeIntegrityError,
  FileNameIdMismatchError,
  FileNotInCubeError
} = require('./errors');

// noinspection EqualityComparisonWithCoercionJS
/**
 * Handles retrieval of job status and downloading of resutts files from CUBE.
 * Given an id number representing the plugin id in ChRIS_store,
 * SubmissionResultsProxy will find the corresponding plugin feed ID of the evaluator
 * for the user's submission and return information about the evaluator.
 */
class SubmissionResultsProxy {
  /**
   * Constructor for SubmissionResulttsProxy
   *
   * @param cube
   * @param storeUrl
   * @param trustProxy
   */
  constructor(cube, storeUrl, trustProxy) {
    this.cube = cube;
    this.storeUrl = storeUrl;

    // might be more elegant to extend express.Router instead
    // however for whatever reason, subclasses of express.Router
    // cannot define methods
    this.router = express.Router();

    // if server is behind a reverse-proxy, use X-Forwarded-Host (:port not be included, fix yo gateway)
    // if server is not behind a reverse-proxy, use Host (:port will be included, useful for devel
    this.router.use((req, res, next) => {
      const host = trustProxy ? req.hostname : req.headers.host;
      res.locals.url = `${req.protocol}://${host}${req.originalUrl}`;
      next();
    });

    this.router.use('/:id', (req, res, next) => this.instanceIdMiddleware(req, res, next));

    this.router.get('/:id/', async (req, res) => {
      res.json(await this.getLimitedInstancesInfo(res.locals.evalInst.href, res.locals.url));
    });

    this.router.get('/:id/files/', async (req, res) => {
      res.json(await this.getFilesListInfo(res.locals.evalInst.href, res.locals.url));
    });

    this.router.get('/:id/files/:fid/:filename', async (req, res) => {
      try {
        res.send(await this.downloadFile(res.locals.evalInst.href, req.params.fid, req.params.filename));
      } catch (e) {
        const debugMessage = `${colors.italic(req.originalUrl)} -> ${colors.red(e.message)}`;
        if (e instanceof FileNotInCubeError) {
          print(debugMessage);
          res.sendStatus(404);
          return;
        }
        if (e instanceof FileNameIdMismatchError) {
          print(debugMessage);
          res.sendStatus(404);
          return;
        }
        throw e;
      }
    });
  }

  /**
   * Middleware to authenticate against the ChRIS_Store
   * and populate res.locals.evalInst with the ID of the evaluator plugin instance.
   *
   * @return {Promise<void>}
   */
  async instanceIdMiddleware(req, res, next) {
    try {
      const evalInstId = await this.getEvaluation(req);
      res.locals.evalInst = {
        id: evalInstId,
        href: `/api/v1/plugins/instances/${evalInstId}`
      };
      next();
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
    const pinfo = colors.dim(`${colors.italic(req.originalUrl)} - `);

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
   * @param baseUrl url of this server
   * @return {Promise<{*>}
   */
  async getLimitedInstancesInfo(href, baseUrl) {
    const inst = await this.cube.get({
      url: href
    });
    return {
      files: baseUrl + 'files/',
      summary: inst.summary,
      status: inst.status,
      plugin_name: inst.plugin_name,
      plugin_version: inst.plugin_version
    }
  }

  async filesInCube(instHref) {
    const inst = await this.cube.get({url: instHref});
    const response = await this.cube.get({ url: inst.files });
    return response.results;
  }

  /**
   * Get list of files produced by a plugin instance.
   * Returns a filtered output from
   *
   *     /api/v1/plugins/instances/<N>/files/
   *
   * @param instHref something like `/api/v1/plugins/instances/<N>/`
   * @param baseUrl url of this server, something like https://cni.example.com/cni/<N>/files/
   * @return {Promise<*>}
   */
  async getFilesListInfo(instHref, baseUrl) {
    const filesList = await this.filesInCube(instHref);
    return {
      results: filesList.map(file => {
        return {
          creation_date: file.creation_date,
          file_resource: file.file_resource.replace(/^.+\/api\/v1\/files\//, baseUrl)
        }
      })
    };
  }

  /**
   * Download a file from CUBE and then send it back to the user.
   *
   * @param instHref plugin instance which this file comes from
   * @param fid file id
   * @param filename file basename
   * @throws FileNotInCubeError
   * @throws FileNameIdMismatchError
   * @return {Promise<*>}
   */
  async downloadFile(instHref, fid, filename) {
    const filesList = await this.filesInCube(instHref);
    for (const file of filesList) {
      if (file.id == fid) {
        if (!file.fname.endsWith(filename)) {
          throw new FileNameIdMismatchError(`given wrong filename for file.id=${file.id} fname=${file.fname}`);
        }
        /*
         * Note about performance:
         * Entire file from CUBE is buffered into memory before responding.
         * The perfect solution would stream data instead.
         *
         * Not a problem for small text files.
         */
        return await this.cube.get({
          url: file.file_resource,
          headers: {
            accept: '*/*'
          }
        });
      }
    }
    throw new FileNotInCubeError(`either you don't own file id=${fid} or that file doesn't exist in CUBE`);
  }
}

module.exports = SubmissionResultsProxy;
