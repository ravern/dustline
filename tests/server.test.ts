import test from 'node:test';
import assert from 'node:assert/strict';
import { GameServer, rayBox, RECONNECT_GRACE } from '../server/game.ts';
import { spawnBody, DT } from '../shared/physics.ts';
import { MAP_BOXES } from '../shared/map.ts';
import { WEAPONS, weaponForSlot } from '../shared/weapons.ts';
import type { Input, ServerMessage, PrimaryId } from '../shared/types.ts';
const loadout = (primary: PrimaryId = 'intervention') => ({ primary, secondary: 'm9' as const });
const input = (patch: Partial<Input> = {}): Input => ({ seq: 0, yaw: 0, pitch: -.06, forward: 0, right: 0, jump: false, sprint: false, crouch: false, ads: true, fire: false, reload: false, slot: 0, time: 1000, ...patch });
function setup(primary: PrimaryId = 'intervention') {
  const game = new GameServer(), a: ServerMessage[] = [], b: ServerMessage[] = [];
  game.connect(m => a.push(m), 'a'); game.connect(m => b.push(m), 'b');
  game.receive('a', { type: 'create', name: 'Alpha', loadout: loadout(primary), bots: 0, private: false }, 1000);
  const room = game.peers.get('a')!.room!;
  game.receive('b', { type: 'join', code: room.code, name: 'Bravo', loadout: loadout() }, 1000);
  game.receive('b', { type: 'ready', ready: true }, 1000); game.receive('a', { type: 'start' }, 1000);
  const shooter = room.players.get('a')!, target = room.players.get('b')!;
  shooter.body = spawnBody({ x: 26, y: 0, z: 0 }); target.body = spawnBody({ x: 26, y: 0, z: -10 });
  shooter.protectedUntil = target.protectedUntil = 0; shooter.nextFire = 0; shooter.ads = true; shooter.adsSince = 999;
  shooter.body.pitch = -.06;
  return { game, room, shooter, target, a, b };
}
test('lobbies require ready players, host authority and explicit loadouts', () => {
  const game = new GameServer(), messages: ServerMessage[] = [];
  game.connect(m => messages.push(m), 'a'); game.connect(m => messages.push(m), 'b');
  game.receive('a', { type: 'create', name: 'Alpha', loadout: loadout('scar'), bots: 0 }, 100);
  const room = game.peers.get('a')!.room!;
  game.receive('b', { type: 'join', code: room.code, name: 'Bravo', loadout: loadout('ak47') }, 100);
  game.receive('a', { type: 'start' }, 100); assert.equal(room.state, 'lobby'); assert.match((messages.at(-1) as { message: string }).message, /Ready/);
  game.receive('b', { type: 'settings', bots: 4, limit: 50, duration: 900 }, 100); assert.equal(room.bots, 0);
  game.receive('b', { type: 'ready', ready: true }, 100); game.receive('a', { type: 'start' }, 100);
  assert.equal(room.state, 'playing'); assert.equal(room.players.get('a')!.loadout.primary, 'scar'); assert.equal(room.players.get('b')!.ammo[0], 30);
  assert.equal(weaponForSlot(room.players.get('a')!.loadout, 1), 'm9'); assert.equal(weaponForSlot(room.players.get('a')!.loadout, 2), 'knife');
  game.receive('a', { type: 'loadout', loadout: loadout() }, 100); assert.equal(room.players.get('a')!.loadout.primary, 'scar');
});
test('host disconnect transfers ownership; empty rooms are removed', () => {
  const { game, room } = setup(); game.disconnect('a', 1000); assert.equal(room.host, 'b'); assert.equal(room.members.get('b')!.ready, true); game.disconnect('b', 1000); assert.equal(game.rooms.size, 1); game.tick(1000 + RECONNECT_GRACE); assert.equal(game.rooms.size, 0);
});
test('Intervention kills with one torso hit, respects bolt timing and reports a quickscope', () => {
  const { room, shooter, target } = setup(); shooter.adsSince = 999.8;
  assert.equal(room.shoot(shooter, input(), 1000), true); assert.equal(target.hp, 0); assert.equal(shooter.kills, 1); assert.equal(target.deaths, 1); assert.equal(shooter.ammo[0], 4);
  assert.equal(room.shoot(shooter, input(), 1000.1), false); assert.equal(shooter.ammo[0], 4);
  assert.equal(room.events.find(e => e.type === 'kill')?.quickscope, true);
});
test('solid map geometry blocks shots before they reach players', () => {
  const { room, shooter, target } = setup();
  MAP_BOXES.push({ x: 26, y: 2, z: -5, w: 3, h: 4, d: 1, kind: 'testwall' });
  try { room.shoot(shooter, input(), 1000); assert.equal(target.hp, 100); assert.equal(room.events.filter(e => e.type === 'hit').length, 0); } finally { MAP_BOXES.pop(); }
});
test('nearest target receives hits; headshots increase rifle damage', () => {
  const { room, shooter, target } = setup('ak47'); shooter.body.pitch = 0;
  room.shoot(shooter, input({ pitch: 0 }), 1000); assert.equal(target.hp, 46); assert.equal(room.events.find(e => e.type === 'hit')?.headshot, true);
});
test('reload transfers authoritative ammo, reserves are bounded and swapping cancels reload', () => {
  const { room, shooter } = setup('ak47'); shooter.ammo[0] = 10; shooter.reserve[0] = 12;
  room.enqueue('a', [input({ seq: 0, reload: true })], 1000); room.tick(1000); assert.equal(shooter.reloading, 1000 + WEAPONS.ak47.reloadTime);
  room.tick(1002); assert.equal(shooter.ammo[0], 22); assert.equal(shooter.reserve[0], 0);
  shooter.reserve[0] = 30; room.enqueue('a', [input({ seq: 1, reload: false })], 1002); room.tick(1002.1);
  room.enqueue('a', [input({ seq: 2, reload: true })], 1002.1); room.tick(1002.2); assert.ok(shooter.reloading > 1002);
  room.enqueue('a', [input({ seq: 3, slot: 1 })], 1002.2); room.tick(1002.3); assert.equal(shooter.reloading, 0); assert.equal(shooter.slot, 1); assert.equal(shooter.ammo[1], 15);
});
test('duplicate fire input cannot inflict damage twice and semi-auto requires release', () => {
  const { room, shooter } = setup(); const command = input({ seq: 1, fire: true });
  room.enqueue('a', [command, command], 1000); room.tick(1000); assert.equal(shooter.ammo[0], 4); assert.equal(shooter.ack, 1);
  room.enqueue('a', [command], 1001.1); room.tick(1001.1); assert.equal(shooter.ammo[0], 4);
});
test('death respawns after 2.5 seconds with a complete loadout and preserves score', () => {
  const { room, shooter, target } = setup(); room.shoot(shooter, input(), 1000); room.tick(1002.49); assert.equal(room.players.get('b')!.hp, 0);
  room.tick(1002.51); const reborn = room.players.get('b')!; assert.equal(reborn.hp, 100); assert.equal(reborn.deaths, 1); assert.equal(reborn.ammo[0], 5); assert.ok(reborn.protectedUntil > 1002.51); assert.ok(room.events.some(e => e.type === 'respawn'));
});
test('health regenerates only after five seconds without damage', () => {
  const { room, target } = setup(); target.hp = 50; target.lastDamage = 1000;
  room.tick(1004.9); assert.equal(target.hp, 50); room.tick(1005.01); assert.ok(target.hp > 50 && target.hp < 51);
});
test('score and time limits finish matches, then the host can return the lobby', () => {
  const { room, shooter, game } = setup(); room.limit = 1; room.shoot(shooter, input(), 1000); assert.equal(room.state, 'finished');
  game.receive('a', { type: 'return' }, 1001); assert.equal(room.state, 'lobby'); assert.equal(room.players.size, 0); assert.equal(room.members.get('b')!.ready, false);
});
test('practice bots move through the real collision world and fire authoritative weapons', () => {
  const game = new GameServer(); game.connect(() => {}, 'a'); game.receive('a', { type: 'create', name: 'Alpha', loadout: loadout(), bots: 3 }, 1000); game.receive('a', { type: 'start' }, 1000);
  const room = game.peers.get('a')!.room!; const starts = [...room.players.values()].filter(p => p.bot).map(p => ({ id: p.id, x: p.body.x, z: p.body.z }));
  for (let i = 1; i <= 600; i++) game.tick(1000 + i * DT);
  assert.equal(starts.length, 3); assert.ok(starts.some(s => { const p = room.players.get(s.id)!; return Math.hypot(p.body.x - s.x, p.body.z - s.z) > 3; }));
  assert.ok(room.eventSequence > 1, 'Bots should acquire targets and produce shots');
});
test('ray intersection deals with parallel axes and boxes behind the shooter', () => {
  const box = { x: 0, y: 1, z: -5, w: 2, h: 2, d: 2, kind: 'wall' };
  assert.equal(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, box), 4);
  assert.equal(rayBox({ x: 3, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, box), null);
  assert.equal(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, box), null);
});
test('commands sent while dead are acknowledged without replaying stale movement after respawn', () => {
  const { room, shooter, target } = setup(); room.shoot(shooter, input(), 1000);
  for (let seq = 0; seq < 100; seq++) room.enqueue('b', [input({ seq, forward: 1, fire: true, time: 1000 + seq / 60 })], 1000 + seq / 60);
  assert.equal(target.ack, 99); assert.equal(room.runtime.get('b')!.queue.length, 0);
  room.tick(1002.51); assert.equal(room.runtime.get('b')!.queue.length, 0); assert.equal(room.players.get('b')!.ack, 99); assert.equal(room.players.get('b')!.ammo[0], 5);
});
test('a late human replaces a bot in a full live match and inherits the requested loadout', () => {
  const game = new GameServer(); game.connect(() => {}, 'a'); game.connect(() => {}, 'b');
  game.receive('a', { type: 'create', name: 'Alpha', loadout: loadout(), bots: 7 }, 1000); game.receive('a', { type: 'start' }, 1000);
  const room = game.peers.get('a')!.room!; assert.equal(room.players.size, 8);
  game.receive('b', { type: 'join', code: room.code, name: 'Bravo', loadout: loadout('scar') }, 1002);
  assert.equal(room.players.size, 8); assert.equal([...room.players.values()].filter(p => p.bot).length, 6); assert.equal(room.players.get('b')!.ammo[0], 20); assert.equal(room.players.get('b')!.loadout.primary, 'scar');
});
