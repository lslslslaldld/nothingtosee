const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const requiredPackages = [
  '@mercuryworkshop/bare-as-module3',
  '@mercuryworkshop/scramjet',
  '@titaniumnetwork-dev/ultraviolet',
  '@tomphttp/bare-server-node',
  'rammerhead'
];

function missingPackages() {
  return requiredPackages.filter((name) => !fs.existsSync(path.join(process.cwd(), 'node_modules', name)));
}

if (missingPackages().length) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(command, ['install', '--ignore-scripts'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

const missing = missingPackages();
if (missing.length) {
  console.error(`Proxy engine packages are missing: ${missing.join(', ')}`);
  process.exit(1);
}
