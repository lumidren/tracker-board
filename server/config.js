'use strict';

const path = require('node:path');

/* Settings come from command-line flags first, then environment variables.
     --port 4190          port to listen on
     --host 127.0.0.1     address to bind
     --lan                bind every interface, so phones on the same network can connect
     --demo               offer the test accounts on the sign-in pages
     --database <file>    SQLite file (":memory:" keeps nothing)
     --time-scale 60      run route progress faster than real time */
function readConfig(argv = process.argv.slice(2), env = process.env) {
  const flag = (name) => argv.includes(`--${name}`);
  const value = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  return {
    port: Number(value('port', env.MAATORA_PORT || 4190)),
    host: flag('lan') ? '0.0.0.0' : value('host', env.MAATORA_HOST || '127.0.0.1'),
    demo: flag('demo') || env.MAATORA_DEMO === '1',
    database: value('database', env.MAATORA_DATABASE || path.join(__dirname, 'data', 'maatora.sqlite')),
    timeScale: Number(value('time-scale', env.MAATORA_TIME_SCALE || 1)),
    tickMs: 4000,
    webRoot: path.join(__dirname, '..'),
    /* Add the Secure flag to cookies when the server sits behind HTTPS. */
    secureCookies: flag('secure-cookies') || env.MAATORA_SECURE_COOKIES === '1',
    maxAttempts: 5,
    lockMs: 30000,
    idleMs: { client: 30 * 60000, admin: 10 * 60000 },
    sessionMs: 12 * 3600000,
    now: Date.now
  };
}

module.exports = { readConfig };
