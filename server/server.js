'use strict';

const os = require('node:os');
const { readConfig } = require('./config.js');
const { createApp, VERSION } = require('./app.js');

/* Addresses a phone on the same network can use when the server runs with --lan. */
function networkAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

async function main() {
  const config = readConfig();
  const app = await createApp(config);

  app.server.listen(config.port, config.host, () => {
    console.log(`Maatora server ${VERSION}`);
    console.log(`  Open        http://localhost:${config.port}`);
    if (config.host === '0.0.0.0') {
      networkAddresses().forEach((address) => console.log(`  On a phone  http://${address}:${config.port}`));
    }
    console.log(`  Database    ${config.database}`);
    console.log(`  State       ${app.restored ? 'continued from the database' : `new, ${app.seeded} test accounts created`}`);
    console.log(`  Demo mode   ${config.demo ? 'on: sign-in pages offer the test accounts' : 'off'}`);
  });

  const stop = () => {
    app.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
