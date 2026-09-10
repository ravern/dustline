import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { GameServer, clock } from './game.ts';
import { DT } from '../shared/physics.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';
const game = new GameServer();
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };
const port = Number(process.env.PORT || 3000);
const info = () => ({ lanUrls: production ? [] : Object.values(networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => `http://${a!.address}:${port}`) });
const server = http.createServer();
let closeDevServer: (() => Promise<void>) | undefined;
if (production) {
  server.on('request', (req, res) => {
    if (req.url?.split('?')[0] === '/api/info') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(info())); return; }
    if (req.url?.split('?')[0] === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: game.rooms.size, players: game.peers.size })); return; }
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
    const dist = path.resolve(root, 'dist');
    let file = path.resolve(dist, `.${pathname}`);
    if (file !== dist && !file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
    if (!path.extname(file)) file = path.join(dist, 'index.html');
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  closeDevServer = () => vite.close();
  server.on('request', (req, res) => {
    if (req.url?.split('?')[0] === '/api/info') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(info())); return; }
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: game.rooms.size, players: game.peers.size })); return; }
    vite.middlewares(req, res);
  });
}
const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });
server.on('upgrade', (request, socket, head) => {
  if (request.url?.split('?')[0] === '/ws') wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  else if (production) socket.destroy();
});
const serialized = new WeakMap<object, string>();
wss.on('connection', ws => {
  const peer = game.connect(message => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount >= 256 * 1024) { ws.close(4001, 'Connection congested'); return; }
    let data = serialized.get(message);
    if (!data) { data = JSON.stringify(message); serialized.set(message, data); }
    ws.send(data);
  }, undefined, clock(), () => ws.close(4000, 'Session resumed elsewhere'));
  let alive = true;
  ws.on('pong', () => { alive = true; });
  const heartbeat = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 15000);
  ws.on('message', (data, binary) => { if (!binary) game.receive(peer, data.toString()); });
  ws.on('close', () => { clearInterval(heartbeat); game.disconnect(peer); });
  ws.on('error', () => ws.close());
});
let previous = performance.now(), accumulator = 0, simulationTime = clock();
const timer = setInterval(() => {
  const current = performance.now();
  accumulator += Math.min((current - previous) / 1000, .1); previous = current;
  while (accumulator >= DT) { simulationTime += DT; game.tick(simulationTime); accumulator -= DT; }
  if (Math.abs(simulationTime - clock()) > .25) simulationTime = clock();
}, 4);
server.listen(port, '0.0.0.0', () => console.log(`DUSTLINE running at http://localhost:${port} (${production ? 'production' : 'development'})`));
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  for (const client of wss.clients) client.terminate();
  wss.close();
  void closeDevServer?.();
  server.close(() => process.exit(0));
  // A connected development HMR socket must not keep a stopped game alive.
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGTERM', close); process.on('SIGINT', close);
