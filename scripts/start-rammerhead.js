const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = process.env.POLARIS_DATA_DIR || path.join(root, 'data');
const jsCacheDirectory = path.join(root, 'node_modules/rammerhead/cache-js');
fs.mkdirSync(jsCacheDirectory, { recursive: true });
const config = require(path.join(root, 'node_modules/rammerhead/src/config.js'));
const sessionDirectory = path.join(dataDir, 'rammerhead-sessions');

fs.mkdirSync(sessionDirectory, { recursive: true });
config.bindingAddress = process.env.RAMMERHEAD_BIND || '0.0.0.0';
config.port = Number(process.env.RAMMERHEAD_PORT || 8080);
config.crossDomainPort = null;
config.publicDir = null;
config.enableWorkers = false;
config.workers = 1;
config.password = null;
config.restrictSessionToIP = false;
config.fileCacheSessionConfig.saveDirectory = sessionDirectory;
config.getServerInfo = (req) => {
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.headers.host || `localhost:${config.port}`;
  const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const protocol = forwardedProtocol === 'https' ? 'https:' : 'http:';
  const origin = new URL(`${protocol}//${host}`);
  return {
    hostname: origin.hostname,
    port: Number(origin.port || (origin.protocol === 'https:' ? 443 : 80)),
    crossDomainPort: null,
    protocol: origin.protocol
  };
};

require(path.join(root, 'node_modules/rammerhead/src/server.js'));
console.log(`Rammerhead listening on ${config.bindingAddress}:${config.port}`);
