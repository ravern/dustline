import test from 'node:test';
import assert from 'node:assert/strict';
import { GameServer } from '../server/game.ts';
import { interpolatePlayers, snapshotIndex } from '../src/interpolation.ts';

function frames() {
  const game = new GameServer(), host = game.connect(() => {}, 'self', 1000);
  game.receive(host, { type: 'create', name: 'Interpolation', loadout: { primary: 'scar', secondary: 'deagle' }, bots: 1 }, 1000);
  game.receive(host, { type: 'start' }, 1000);
  const a = host.room!.snapshot(1001), b = host.room!.snapshot(1001.1);
  a.players[1].body.x = 0; a.players[1].body.y = 1; a.players[1].body.z = 2; a.players[1].body.yaw = Math.PI - .1;
  b.players[1].body.x = 2; b.players[1].body.y = 3; b.players[1].body.z = 4; b.players[1].body.yaw = -Math.PI + .1;
  return { a, b, id: a.players[1].id };
}

test('remote interpolation preserves smooth positions, shortest yaw and latest combat metadata', () => {
  const { a, b } = frames(); b.players[1].hp = 45; b.players[1].slot = 1; b.players[1].ammo[1] = 4;
  const originalA = structuredClone(a), originalB = structuredClone(b);
  const result = interpolatePlayers(b, [a, b], 1001.05, 'self');
  assert.equal(result[0], b.players[0], 'self prediction must never be interpolated');
  assert.ok(Math.abs(result[1].body.x - 1) < 1e-9); assert.ok(Math.abs(result[1].body.y - 2) < 1e-9); assert.ok(Math.abs(result[1].body.z - 3) < 1e-9);
  assert.ok(Math.abs(result[1].body.yaw - Math.PI) < 1e-9);
  assert.equal(result[1].hp, 45); assert.equal(result[1].slot, 1); assert.equal(result[1].ammo[1], 4);
  assert.deepEqual(a, originalA); assert.deepEqual(b, originalB);
});

test('joining, leaving and reordered snapshot rows are matched by stable player identity', () => {
  const { a, b, id } = frames(); b.players.reverse();
  const result = interpolatePlayers(b, [a, b], 1001.05, 'self');
  assert.equal(result[0].id, id); assert.ok(Math.abs(result[0].body.x - 1) < 1e-9);
  const joined = structuredClone(b); joined.players.push({ ...joined.players[0], id: 'new-joiner' });
  assert.equal(interpolatePlayers(joined, [a, b], 1001.05, 'self')[2], joined.players[2]);
  const left = { ...b, players: [b.players[1]] };
  assert.deepEqual(interpolatePlayers(left, [a, b], 1001.05, 'self').map(p => p.id), ['self']);
});

test('death, respawn and large teleports snap directly instead of crossing through the map', () => {
  for (const change of ['death', 'respawn', 'teleport'] as const) {
    const { a, b } = frames();
    if (change === 'death') a.players[1].hp = 0;
    if (change === 'respawn') b.players[1].deaths++;
    if (change === 'teleport') b.players[1].body.x = 20;
    assert.equal(interpolatePlayers(b, [a, b], 1001.05, 'self')[1], b.players[1]);
  }
});

test('missing history and render times outside the buffer stay at the endpoint without extrapolation', () => {
  const { a, b } = frames();
  assert.deepEqual(interpolatePlayers(b, [], b.time + 5, 'self'), b.players);
  assert.equal(interpolatePlayers(b, [a, b], a.time - 1, 'self')[1].body.x, a.players[1].body.x);
  assert.equal(interpolatePlayers(b, [a, b], b.time + 1, 'self')[1].body.x, b.players[1].body.x);
});

test('snapshot indexes are reused and minimap shot visibility respects each immutable snapshot time', () => {
  const { a, b, id } = frames();
  a.events = [{ id: 1, type: 'shot', player: id, time: a.time - .5 }, { id: 2, type: 'shot', player: 'expired', time: a.time - 1.2 }, { id: 3, type: 'hit', player: 'not-a-shot', time: a.time }];
  assert.equal(snapshotIndex(a), snapshotIndex(a)); assert.notEqual(snapshotIndex(a), snapshotIndex(b));
  assert.equal(snapshotIndex(a).players.get(id), a.players[1]);
  assert.deepEqual([...snapshotIndex(a).shooters], [id]);
  assert.equal(snapshotIndex(b).shooters.size, 0);
});
