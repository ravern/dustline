import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { decodeServerMessage, SNAPSHOT_PROTOCOL } from '../shared/wire.ts';

// Run against an already-running local game: node --import tsx tests/multiplayer.mjs
const base = new URL(process.env.DUSTLINE_TEST_URL || 'http://localhost:3000');
const endpoint = new URL('/ws', base); endpoint.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
const loadout = { primary: 'ak47', secondary: 'm9' };
const compact = process.env.DUSTLINE_TEST_WIRE === 'compact';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 6000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) { const result = predicate(); if (result) return result; await sleep(15); }
  throw new Error(`Timed out: ${label}`);
}
async function connect(useCompact = compact) {
  const socket = useCompact ? new WebSocket(endpoint, SNAPSHOT_PROTOCOL) : new WebSocket(endpoint), client = { socket, messages: [], id: '', token: '', snapshot: undefined, bytes: 0, snapshots: 0, compactSnapshots: 0, frameBytes: new Map() };
  socket.on('message', data => {
    const message = decodeServerMessage(data.toString()); assert.ok(message, 'valid server frame'); client.messages.push(message);
    if (message.type === 'welcome') { client.id = message.id; client.token = message.token; }
    if (message.type === 'snapshot') { client.snapshot = message; client.snapshots++; client.bytes += data.length; client.frameBytes.set(message.tick, data.length); if (data[0] === 91) client.compactSnapshots++; }
  });
  socket.on('error', () => {});
  client.send = message => socket.send(JSON.stringify(message));
  await until(() => client.token, 'welcome'); assert.equal(socket.protocol, useCompact ? SNAPSHOT_PROTOCOL : ''); return client;
}
const results = [];
for (const [mode, map, count] of [['ffa', 'airfield', 32], ['tdm', 'homestead', 32], ['ctf', 'derrick', 32]]) {
  const clients = [];
  try {
    const host = await connect(); clients.push(host);
    host.send({ type: 'create', name: 'Transport host', loadout, bots: 0, private: true, mode, map });
    const room = await until(() => host.messages.find(m => m.type === 'room')?.room, 'room creation');
    for (let index = 1; index < count; index++) {
      const client = await connect(compact && index !== 1); clients.push(client);
      client.send({ type: 'join', code: room.code, name: `Transport ${index}`, loadout });
      await until(() => client.messages.some(m => m.type === 'room'), 'join');
      client.send({ type: 'ready', ready: true });
    }
    await until(() => host.messages.filter(m => m.type === 'room').at(-1)?.room.players.every(p => p.ready), 'ready players');
    host.send({ type: 'start' });
    await Promise.all(clients.map(c => until(() => c.snapshot?.state === 'playing', 'deployment')));
    assert.equal(host.snapshot.players.length, count); assert.equal(host.snapshot.mode, mode); assert.equal(host.snapshot.map, map);
    if (mode !== 'ffa') for (const team of ['red', 'blue']) assert.equal(host.snapshot.players.filter(p => p.team === team).length, 16);
    const extra = await connect();
    extra.send({ type: 'join', code: room.code, name: 'Overflow', loadout });
    await until(() => extra.messages.some(m => m.type === 'error'), 'capacity rejection'); extra.socket.close();
    const started = performance.now(), stalled = [], delayed = [];
    for (let batch = 0; batch < 75; batch++) {
      for (let index = 0; index < clients.length; index++) {
        const client = clients[index], self = client.snapshot.players.find(p => p.id === client.id);
        const inputs = [0, 1].map(step => ({ seq: batch * 2 + step, yaw: self.body.yaw, pitch: 0, forward: batch < 50 ? 1 : 0, right: 0, jump: false, sprint: false, crouch: false, ads: false, fire: compact && index === 0 && batch === 45, reload: false, frag: compact && index === 0 && batch === 1, flash: compact && index === 0 && batch === 25, slot: 0, time: Date.now() / 1000, matchId: client.snapshot.matchId }));
        const message = { type: 'inputs', inputs };
        if (index === 1 && batch >= 25 && batch < 34) { stalled.push(message); continue; }
        if (index === 1 && batch === 34) for (const old of stalled.splice(0)) client.send(old);
        // Ordered per-player simulated transit, including a 250 ms RTT peer.
        const delay = index === 1 ? 0 : [0, 40, 80, 125][index % 4];
        delayed.push(new Promise(resolve => setTimeout(() => { client.send(message); resolve(); }, delay)));
      }
      await sleep(Math.max(0, started + (batch + 1) * 1000 / 30 - performance.now()));
    }
    await Promise.all(delayed);
    await Promise.all(clients.map(c => until(() => c.snapshot.players.find(p => p.id === c.id)?.ack === 149, 'current input acknowledgement')));
    let wire;
    if (compact) {
      await until(() => host.messages.some(m => m.type === 'snapshot' && m.events.some(e => e.type === 'grenade_explode')), 'grenade event delivery');
      const reference = new Map(clients[1].messages.filter(m => m.type === 'snapshot').map(m => [m.tick, m]));
      const matched = host.messages.filter(m => m.type === 'snapshot' && reference.has(m.tick));
      assert.ok(matched.length > 20);
      for (const frame of matched) assert.deepEqual(frame, reference.get(frame.tick));
      for (const type of ['shot', 'grenade_throw', 'grenade_explode']) assert.ok(matched.some(m => m.events.some(e => e.type === type)), `${mode}: ${type} survives compact transport`);
      assert.equal(host.compactSnapshots, host.snapshots); assert.equal(clients[1].compactSnapshots, 0);
      const raw = matched.reduce((sum, m) => sum + clients[1].frameBytes.get(m.tick), 0), small = matched.reduce((sum, m) => sum + host.frameBytes.get(m.tick), 0);
      wire = { matchedFrames: matched.length, rawBytes: Math.round(raw / matched.length), compactBytes: Math.round(small / matched.length), savingsPercent: Math.round((1 - small / raw) * 100) };
      assert.ok(small < raw * .65, 'compact encoding saves at least35% without loss');
    }
    const previous = clients[1], oldId = previous.id, oldToken = previous.token;
    previous.socket.terminate(); await sleep(100);
    const resumed = await connect(); clients[1] = resumed;
    resumed.send({ type: 'resume', token: oldToken });
    await until(() => resumed.messages.some(m => m.type === 'welcome' && m.resumed), 'session resume');
    await until(() => resumed.snapshot?.players.find(p => p.id === oldId)?.ack === 149, 'resumed snapshot');
    assert.equal(resumed.id, oldId); assert.notEqual(resumed.token, oldToken);
    assert.equal(resumed.snapshot.matchId, host.snapshot.matchId);
    for (const client of clients) if (client !== resumed) assert.equal(JSON.stringify(client.messages.filter(m => m.type !== 'welcome')).includes(oldToken), false);
    if (compact) assert.ok(resumed.compactSnapshots > 0);
    results.push({ mode, map, players: count, acknowledged: 150, stallRecoveryMs: 300, resume: true, snapshotsPerSecond: Math.round(host.snapshots / ((performance.now() - started) / 1000)), meanSnapshotBytes: Math.round(host.bytes / host.snapshots), ...(wire ? { wire } : {}) });
  } finally {
    for (const client of clients) { if (client.socket.readyState === WebSocket.OPEN) client.send({ type: 'leave' }); client.socket.close(); }
  }
}
console.log(JSON.stringify(results, null, 2));
