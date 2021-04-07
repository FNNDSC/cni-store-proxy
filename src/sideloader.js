/*
 * A bridge for registering plugins by name from the ChRIS_store
 * to the ChRIS backend.
 * 
 * The ChRIS backend container must have the label org.chrisproject.role=cube
 * 
 * Example:
 * 
 *     curl http://localhost:8009/register --data '{"name": "pl-cnisubmission"}'
 */
const colors = require('colors');
const express = require('express');
const axios = require('axios');

const print = require('./print');

const VERSION = '1.0.0';
const CNI_COMPUTE_ENV = process.env.CNI_COMPUTE_ENV || 'host';


class Plugin2CubeError extends Error {

}

async function getCUBE() {
  const res = await axios.get(
    '/containers/json',
    {
      socketPath: '/var/run/docker.sock',
      params: {
        filters: JSON.stringify({
          label: [
            'org.chrisproject.role=cube'
          ],
          status: [
            'running'
          ]
        })
      }
    }
  );
  if (res.data.length < 1) {
    throw new Plugin2CubeError('No running container with'
      + ' label "org.chrisproject.role=cube" found.');
  }
  return res.data[0];
}


print(colors.dim('process started'));

getCUBE().then(cube => {
  print('Found CUBE container'
    + '\n\tName: ' + cube.Names
    + '\n\tId:   ' + cube.Id);

  const app = express();
  app.use(express.json());

  app.get('/', (req, res) => {
    res.send({
      name: 'ChRIS backend plugin sideloader',
      version: VERSION
    });
  })

  app.post('/register', async (req, res) => {
    res.type('text/plain');
    if (!req.body || !req.body.name) {
      return res.status(400).send('"name" is required');
    }

    try {

      const createExec = await axios.post(
        `/containers/${cube.Id}/exec`,
        {
          Cmd: [
            // 'echo', 'hello'
            'python', 'plugins/services/manager.py', 'register',
            CNI_COMPUTE_ENV,
            '--pluginname', req.body.name
          ],
          AttachStdout: true,
          AttachStderr: true
        },
        {
          socketPath: '/var/run/docker.sock'
        }
      );
      const startExec = await axios.post(
        `/exec/${createExec.data.Id}/start`,
        {
          Detach: false,
          Tty: false
        },
        {
          socketPath: '/var/run/docker.sock'
        }
      );
      const inspectExec = await axios.get(
        `/exec/${createExec.data.Id}/json`,
        {
          socketPath: '/var/run/docker.sock'
        }
      )
  
      if (inspectExec.data.ExitCode === 0) {
        res.status(201);
        print(colors.green(req.body.name));
      }
      else {
        res.status(500);
        print(colors.red(req.body.name + ' ERROR\n'));
        console.log(startExec)

      }
      res.send(startExec.data);
    } catch (e) {
      print(colors.red('docker error, see below.\n' + e));
      res.status(503).send();
    };
  });

  const server = app.listen(process.env.PORT || 8009, () => {
    const url = `http://localhost:${server.address().port}/register/`;
    print(colors.cyan('listening on ' + colors.underline(url)));
  });
});
