const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  cube: {
    container: process.env.CNI_CUBE_CONTAINER || 'chris',
    url: process.env.CUBE_URL ?
    process.env.CUBE_URL.replace('/api/v1/', '')
    : 'http://localhost:8000',
    username: process.env.CUBE_USERNAME || 'cniadmin',
    password: process.env.CUBE_PASSWORD || 'cniadmin1234',
    email: process.env.CUBE_EMAIL || 'cni@babymri.org'
  },
  chrisStore: {
    url: process.env.CHRIS_STORE_URL ? 
      process.env.CHRIS_STORE_URL.replace('/api/v1/', '')
      : 'http://localhost:8010',
    username: process.env.CHRISSTORE_USERNAME || 'cniadmin',
    password: process.env.CHRISSTORE_PASSWORD || 'cniadmin1234',
    email: process.env.CHRISSTORE_EMAIL || 'cni@babymri.org'
  },

  plugins: {
    fs: {
      docker: process.env.CNI_FS_PLUGIN_DOCKER || 'sandip117/pl-test_data_generator',
      name: process.env.CNI_FS_PLUGIN_NAME || 'test_data_generator',
      repo: process.env.CNI_FS_PLUGIN_REPO || 'https://github.com/sandip117/pl-test_data_generator'
    },
    evaluator: {
      docker: process.env.CNI_EVALUATOR_PLUGIN_DOCKER || 'aiwc/cni_challenge_evaluation:latest',
      name: process.env.CNI_EVALUATOR_PLUGIN_NAME || 'cni-evaluator',
      repo: process.env.CNI_EVALUATOR_PLUGIN_REPO || 'https://github.com/aichung/pl-cni_challenge_evaluation'
    }
  },
  runArgs: {
    fs: process.env.CNI_FS_ARGS ?
      JSON.parse(process.env.CNI_FS_ARGS) : { "data": [{ "name": "dir", "value": "/usr/src/data" }]}    ,
    evaluator: process.env.CNI_EVALUATOR_ARGS ?
      JSON.parse(process.env.CNI_EVALUATOR_ARGS) : [],
    submission: process.env.CNI_SUBMISSION_ARGS ? 
      JSON.parse(process.env.CNI_SUBMISSION_ARGS) : []
  },
  feed: {
    name: process.env.CNI_FEED_NAME || 'CNI Challenge',
    description: process.env.CNI_FEED_DESCRIPTION || 'submissions for the MICCAI Connectomics in Neuroimaging Challenge'
  }
}
