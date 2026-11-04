/**
 * realServer.js
 * Helper de pruebas: arranca el servidor real (server.js) en un puerto de prueba con la lectura/escritura
 * de store.json bloqueada (blockDisk.js) y lo apaga al terminar. No toca datos reales.
 */

const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const SERVER_JS = path.join(__dirname, '..', '..', 'server.js');
const PRELOAD = path.join(__dirname, 'blockDisk.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function portIsFree(port) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

/**
 * Arranca server.js en `port` con las variables de entorno extra indicadas.
 * Devuelve { base, stop, getLog, isExited, portIsFree }.
 */
async function startServer({ port, env = {} }) {
  if (!(await portIsFree(port))) {
    throw new Error('El puerto ' + port + ' ya esta en uso. No se arranca el servidor para no interferir.');
  }

  const child = spawn(process.execPath, ['--require', PRELOAD, SERVER_JS], {
    env: Object.assign({}, process.env, { PORT: String(port) }, env),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });

  let exited = false;
  child.on('exit', () => { exited = true; });

  async function stop() {
    if (exited) return;
    child.kill();
    const limit = Date.now() + 5000;
    while (!exited && Date.now() < limit) await sleep(100);
    if (!exited) {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      await sleep(500);
    }
  }

  const base = 'http://127.0.0.1:' + port;
  const limit = Date.now() + 15000;
  let ready = false;
  while (Date.now() < limit && !exited) {
    try {
      const r = await fetch(base + '/health');
      if (r.ok) { ready = true; break; }
    } catch (e) { /* aun no arranca */ }
    await sleep(200);
  }
  if (!ready) {
    await stop();
    throw new Error('El servidor no respondio en /health a tiempo\n' + log);
  }

  return { base, stop, getLog: () => log, isExited: () => exited, portIsFree: () => portIsFree(port) };
}

module.exports = { startServer };
