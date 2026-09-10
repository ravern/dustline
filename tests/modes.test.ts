import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAG_RETURN_TIME, GameServer } from '../server/game.ts';
import { MAPS, getMap, type MapId } from '../shared/map.ts';
import { DT, move, spawnBody } from '../shared/physics.ts';
import type { GameMode, Input, ServerMessage, Team } from '../shared/types.ts';
const loadout = { primary: 'intervention' as const, secondary: 'm9' as const };
const command = (patch: Partial<Input> = {}): Input => ({ seq: 0, yaw: 0, pitch: -.06, forward: 0, right: 0, jump: false, sprint: false, crouch: false, ads: true, fire: false, reload: false, slot: 0, time: 1000, ...patch });
function lobby(mode: GameMode = 'ffa', bots = 0, map: MapId = 'yard') {
  const game = new GameServer(), messages: ServerMessage[] = [];
  const host = game.connect(m => messages.push(m), 'a', 1000);
  game.receive(host, { type: 'create', name: 'Alpha', loadout, bots, mode, map }, 1000);
  const room = host.room!;
  const join = (id: string) => {
    const peer = game.connect(m => messages.push(m), id, 1000);
    game.receive(peer, { type: 'join', code: room.code, name: id, loadout }, 1000);
    game.receive(peer, { type: 'ready', ready: true }, 1000);
    return peer;
  };
  return { game, messages, host, room, join };
}
function match(mode: GameMode = 'ctf') {
  const setup = lobby(mode); setup.join('b'); setup.game.receive(setup.host, { type: 'start' }, 1000);
  const red = [...setup.room.players.values()].find(p => mode === 'ffa' ? p.id === 'a' : p.team === 'red')!;
  const blue = [...setup.room.players.values()].find(p => mode === 'ffa' ? p.id === 'b' : p.team === 'blue')!;
  red.body = spawnBody({ x: 26, y: 0, z: 0 }); blue.body = spawnBody({ x: 26, y: 0, z: -10 });
  red.protectedUntil = blue.protectedUntil = 0; red.nextFire = 0; red.ads = true; red.adsSince = 999; red.body.pitch = -.06;
  return { ...setup, red, blue };
}

test('humans must enter a name; blank requests never create rooms or replace players', () => {
  const { game, host, room, messages } = lobby('ffa', 7);
  const blank = game.connect(m => messages.push(m), 'blank', 1000);
  game.receive(blank, { type: 'create', name: ' \n <> ', loadout, bots: 0 }, 1000);
  assert.equal(game.rooms.size, 1); assert.equal(blank.room, undefined);
  game.receive(host, { type: 'start' }, 1000);
  game.receive(blank, { type: 'join', code: room.code, name: '  ', loadout }, 1000);
  assert.equal(room.players.size, 8); assert.equal(room.members.has('blank'), false);
  assert.match((messages.at(-1) as { message: string }).message, /Enter your name/);
});

test('All modes allow sixteen players; team modes have eight on each team', () => {
  for (const mode of ['ffa', 'tdm', 'ctf'] as const) {
    const { game, host, room, join, messages } = lobby(mode), capacity = 16;
    for (let index = 1; index < capacity; index++) join(`p${index}`);
    const overflow = join('overflow'); assert.equal(overflow.room, undefined);
    assert.equal(room.members.size, capacity); assert.equal(room.info.maxPlayers, capacity);
    if (mode !== 'ffa') for (const team of ['red', 'blue'] as Team[]) assert.equal([...room.members.values()].filter(p => p.team === team).length, 8);
    game.receive(host, { type: 'start' }, 1000); assert.equal(room.players.size, capacity);
    game.receive(host, { type: 'list' }, 1000);
    const list = messages.at(-1) as Extract<ServerMessage, { type: 'rooms' }>;
    assert.equal(list.rooms[0].maxPlayers, capacity); assert.equal(list.rooms[0].mode, mode);
  }
});

test('bot fill and late joins obey total and per-team limits', () => {
  for (const mode of ['ffa', 'tdm', 'ctf'] as const) {
    const { game, host, room, join } = lobby(mode, 99);
    game.receive(host, { type: 'start' }, 1000);
    assert.equal(room.players.size, room.maxPlayers);
    for (let index = 0; index < 6; index++) join(`late${index}`);
    assert.equal(room.players.size, room.maxPlayers);
    assert.equal([...room.players.values()].filter(p => !p.bot).length, 7);
    if (mode !== 'ffa') for (const team of ['red', 'blue'] as Team[]) assert.equal([...room.players.values()].filter(p => p.team === team).length, 8);
  }
});

test('changing modes balances teams, updates limits, resets readiness, and retains nine humans when switching to FFA', () => {
  const { game, host, room, join } = lobby('tdm');
  for (let index = 0; index < 8; index++) join(`p${index}`);
  game.receive(host, { type: 'settings', mode: 'ffa' }, 1000); assert.equal(room.mode, 'ffa');
  game.receive(host, { type: 'settings', mode: 'ctf', map: 'relay', bots: 99 }, 1000);
  assert.equal(room.mode, 'ctf'); assert.equal(room.limit, 3); assert.equal(room.map, 'relay'); assert.equal(room.bots, 7);
  assert.equal(room.members.get('p0')!.ready, false);
  game.receive(host, { type: 'settings', mode: 'bogus', map: 'yard' }, 1000); assert.equal(room.map, 'relay');
});

test('team damage is disabled; TDM finishes from team kills and CTF ignores the kill limit', () => {
  const tdm = match('tdm');
  tdm.blue.team = 'red'; tdm.room.shoot(tdm.red, command(), 1000);
  assert.equal(tdm.blue.hp, 100); assert.equal(tdm.red.kills, 0);
  tdm.blue.team = 'blue'; tdm.red.nextFire = 0; tdm.room.limit = 1;
  tdm.room.shoot(tdm.red, command(), 1001);
  assert.equal(tdm.room.teamScores.red, 1); assert.equal(tdm.room.winner, 'red'); assert.equal(tdm.room.state, 'finished');
  const ctf = match(); ctf.room.limit = 1; ctf.room.shoot(ctf.red, command(), 1000);
  assert.equal(ctf.red.kills, 1); assert.equal(ctf.room.teamScores.red, 0); assert.equal(ctf.room.state, 'playing');
});

test('CTF pickup and capture require bringing the enemy flag to a home flag', () => {
  const { room, red, blue } = match(), own = room.flags.find(f => f.team === 'red')!, enemy = room.flags.find(f => f.team === 'blue')!;
  red.body = spawnBody(enemy.home); room.updateFlags(1001);
  assert.equal(enemy.carrier, red.id); assert.equal(red.protectedUntil, 0);
  blue.body = spawnBody(own.home); room.updateFlags(1002); assert.equal(own.carrier, blue.id);
  blue.body = spawnBody({ x: 26, y: 0, z: 0 }); red.body = spawnBody(own.home); room.updateFlags(1003);
  assert.equal(room.teamScores.red, 0, 'a stolen home flag prevents capture');
  room.dropFlags(blue.id, 1004); assert.equal(own.returnAt, 1004 + FLAG_RETURN_TIME);
  red.body = spawnBody(own.position); room.updateFlags(1005); assert.equal(own.returnAt, 0); assert.deepEqual(own.position, own.home);
  room.limit = 1; red.body = spawnBody(own.home); room.updateFlags(1006);
  assert.equal(room.teamScores.red, 1); assert.equal(red.captures, 1); assert.equal(room.winner, 'red');
  assert.equal(enemy.carrier, null); assert.deepEqual(enemy.position, enemy.home);
  assert.ok(room.events.some(e => e.type === 'flag_capture' && e.team === 'red'));
});

test('death, disconnect, touch-return and timeout safely release carried flags', () => {
  const { game, room, red, blue } = match(), own = room.flags.find(f => f.team === 'red')!;
  blue.body = spawnBody(own.home); room.updateFlags(1001); assert.equal(own.carrier, blue.id);
  blue.body = spawnBody({ x: 26, y: 0, z: -10 }); room.shoot(red, command(), 1002);
  assert.equal(own.carrier, null); assert.equal(own.returnAt, 1002 + FLAG_RETURN_TIME);
  room.updateFlags(1002 + FLAG_RETURN_TIME); assert.deepEqual(own.position, own.home); assert.equal(own.returnAt, 0);
  const reborn = room.createPlayer(blue.id, false, 1030); reborn.body = spawnBody(own.home); room.updateFlags(1031);
  game.disconnect('b', 1032); assert.equal(own.carrier, null); assert.equal(own.returnAt, 1032 + FLAG_RETURN_TIME);
});

test('flag objectives cannot be picked up through solid cover', () => {
  const { room, red } = match(), enemy = room.flags.find(f => f.team === 'blue')!;
  red.body = spawnBody({ x: enemy.home.x + 1, y: enemy.home.y, z: enemy.home.z });
  const wall = { x: enemy.home.x + .5, y: 1, z: enemy.home.z, w: .15, h: 2, d: 3, kind: 'test' };
  room.arena.boxes.push(wall);
  try { room.updateFlags(1001); assert.equal(enemy.carrier, null); } finally { room.arena.boxes.pop(); }
});

test('selected maps drive authoritative spawns, flags, snapshots, and movement', () => {
  for (const {id} of MAPS) {
    const { game, host, room } = lobby('ctf', 1, id); game.receive(host, { type: 'start' }, 1000);
    const map = getMap(id), player = room.players.get('a')!;
    assert.ok(map.teamSpawns[player.team!].some(s => s.x === player.body.x && s.z === player.body.z));
    assert.deepEqual(room.flags.find(f => f.team === 'red')!.home, map.flagBases.red);
    const input = command({ matchId: room.matchId, forward: 1 });
    const expected = move(player.body, input, DT, map); room.enqueue('a', [input], 1001); room.tick(1001);
    assert.deepEqual(player.body, expected); assert.equal(room.snapshot(1001).map, id);
  }
});

test('new matches reject stale commands without spending acknowledgement or movement credit', () => {
  const { game, host, room } = lobby('ffa', 1); game.receive(host, { type: 'start' }, 1000);
  const previous = room.matchId; room.finish(1001); room.returnToLobby(); room.start(1002);
  assert.notEqual(room.matchId, previous);
  room.enqueue('a', [command({ matchId: previous, seq: 10 })], 1003); assert.equal(room.runtime.get('a')!.queue.length, 0);
  room.enqueue('a', [command({ matchId: room.matchId, seq: 0 })], 1003); assert.equal(room.runtime.get('a')!.queue.length, 1);
});

test('practice bots navigate each arena to pick up and capture flags without teleporting', () => {
  for (const {id:map} of MAPS) {
    const { game, host, room } = lobby('ctf', 1, map); game.receive(host, { type: 'start' }, 1000); room.limit = 1;
    // Isolate objective navigation from combat with a stationary distant observer.
    room.players.get(host.id)!.body.y = 200;
    const bot = [...room.players.values()].find(p => p.bot)!;
    let previous = { ...bot.body };
    for (let tick = 1; tick <= 5400 && room.state === 'playing'; tick++) {
      game.tick(1000 + tick * DT);
      assert.ok(Math.hypot(bot.body.x - previous.x, bot.body.z - previous.z) < .21, 'the bot uses ordinary movement steps');
      previous = { ...bot.body };
    }
    assert.equal(room.teamScores[bot.team!], 1, `${map}: bot completes the flag route`);
    assert.equal(room.winner, bot.team);
  }
});

test('full team deployments give each player an unoccupied spawn', () => {
  for (const {id:map} of MAPS) {
    for (const mode of ['ffa','tdm'] as const) {
    const { game, host, room } = lobby(mode, 15, map); game.receive(host, { type: 'start' }, 1000);
    const positions = [...room.players.values()].map(p => `${p.body.x},${p.body.y},${p.body.z}`);
    assert.equal(new Set(positions).size, 16, `${map} ${mode}: players should not spawn inside one another`);
    }
  }
});
