const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', 'freeport-async', 'index.js');

const PATCHED_SOURCE = `const net = require("net");

const DEFAULT_PORT_RANGE_START = 11000;

function testPortAsync(port, hostname) {
  return new Promise(function(fulfill) {
    const server = net.createServer();
    server.on("error", function() {
      setTimeout(() => fulfill(false), 0);
    });

    try {
      server.listen({ port, host: hostname }, function() {
        server.once("close", function() {
          setTimeout(() => fulfill(true), 0);
        });
        server.close();
      });
    } catch {
      setTimeout(() => fulfill(false), 0);
    }
  });
}

async function availableAsync(port, options = {}) {
  const hostnames =
    options.hostnames && options.hostnames.length ? options.hostnames : [undefined];
  for (const hostname of hostnames) {
    if (!(await testPortAsync(port, hostname))) {
      return false;
    }
  }
  return true;
}

function freePortRangeAsync(rangeSize, rangeStart, options = {}) {
  rangeSize = rangeSize || 1;
  return new Promise((fulfill, reject) => {
    const lowPort = rangeStart || DEFAULT_PORT_RANGE_START;
    if (lowPort < 0 || lowPort > 65535 || lowPort + rangeSize - 1 > 65535) {
      return reject(new Error("No available ports in range"));
    }

    const awaitables = [];
    for (let i = 0; i < rangeSize; i++) {
      awaitables.push(availableAsync(lowPort + i, options));
    }

    return Promise.all(awaitables).then(function(results) {
      const ports = [];
      for (let i = 0; i < results.length; i++) {
        if (!results[i]) {
          return freePortRangeAsync(rangeSize, lowPort + rangeSize, options).then(fulfill, reject);
        }
        ports.push(lowPort + i);
      }
      fulfill(ports);
    });
  });
}

async function freePortAsync(rangeStart, options = {}) {
  const result = await freePortRangeAsync(1, rangeStart, options);
  return result[0];
}

module.exports = freePortAsync;
module.exports.availableAsync = availableAsync;
module.exports.rangeAsync = freePortRangeAsync;
`;

try {
  if (!fs.existsSync(target)) {
    process.exit(0);
  }

  const original = fs.readFileSync(target, 'utf8');
  if (original === PATCHED_SOURCE) {
    console.log('[patch-freeport-async] already patched');
    process.exit(0);
  }

  fs.writeFileSync(target, PATCHED_SOURCE, 'utf8');
  console.log('[patch-freeport-async] patched');
} catch (err) {
  console.error('[patch-freeport-async] failed:', err?.message || err);
  process.exit(1);
}
