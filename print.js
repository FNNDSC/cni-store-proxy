const colors = require('colors');

/**
 * Colorful debugging print command with timestamps.
 * @param info message to print
 * @param req request object, if available
 */
function print(info, req) {
  info = info ? ' ' + info : '';
  let strReq = req || '';
  if (req && req.method) {
    switch (req.method) {
      case 'GET':
        strReq = `${colors.green(req.method)}`;
        break;
      case 'POST':
        strReq = `${colors.blue(req.method)}`;
        break;
      default:
        strReq = colors.cyan(req.method);
    }
    strReq = `${req.ip} ${strReq} ${colors.italic(req.originalUrl)}:`;
  }
  console.log(colors.dim(`[ ${new Date().toISOString()} ] `) + strReq + info);
}

module.exports = print;
