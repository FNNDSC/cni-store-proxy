const dotenv = require('dotenv');
const path = require('path');

module.exports = async () => {
  dotenv.config();
  dotenv.config({path: path.resolve(process.cwd(), 'parameters/plugins.env')});

  console.log(process.env.CUBE_URL)
}
