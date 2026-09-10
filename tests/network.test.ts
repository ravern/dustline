import test from 'node:test';
import assert from 'node:assert/strict';
import { GameServer, RECONNECT_GRACE } from '../server/game.ts';
import { NetworkClock } from '../src/network.ts';
import type { Input, ServerMessage } from '../shared/types.ts';
const loadout = { primary: 'ak47', secondary: 'm9' };
const input = (seq: number): Input => ({ seq, yaw: 0, pitch: 0, forward: 1, right: 0, jump: false, sprint: false, crouch: false, ads: false, fire: false, reload: false, slot: 0, time: 1000 });
function setup() {
  const game = new GameServer(), messages: ServerMessage[] = [], otherMessages: ServerMessage[] = [];
  const a = game.connect(m => messages.push(m), 'a', 1000), b = game.connect(m => otherMessages.push(m), 'b', 1000);
  game.receive(a, { type: 'create', name: 'Alpha', loadout, mode: 'tdm', bots: 0 }, 1000);
  const room = a.room!;
  game.receive(b, { type: 'join', code: room.code, name: 'Bravo', loadout }, 1000);
  game.receive(b, { type: 'ready', ready: true }, 1000); game.receive(a, { type: 'start' }, 1000);
  return { game, a, b, room, messages, otherMessages };
}

test('reconnect resumes player identity, team, score and acknowledgement without replaying stale commands', () => {
  const { game, a, room, otherMessages } = setup(), token = a.token, player = room.players.get('a')!;
  player.kills = 4; room.teamScores.red = 4;
  room.enqueue('a', [input(0), input(1), input(2)], 1001);
  game.disconnect(a, 1001);
  assert.equal(room.members.get('a')!.connected, false); assert.equal(room.host, 'b'); assert.equal(player.ack, 2);
  const received: ServerMessage[] = [], replacement = game.connect(m => received.push(m), 'temporary', 1002);
  game.receive(replacement, { type: 'resume', token }, 1002);
  assert.equal(replacement.id, 'a'); assert.equal(replacement.room, room); assert.equal(room.players.get('a'), player);
  assert.equal(player.kills, 4); assert.equal(player.team, 'red'); assert.equal(room.teamScores.red, 4);
  assert.equal(room.runtime.get('a')!.queue.length, 0); assert.equal(room.runtime.get('a')!.commandCredit, 0);
  assert.ok(received.some(m => m.type === 'welcome' && m.resumed && m.id === 'a'));
  assert.ok(received.some(m => m.type === 'snapshot' && m.players.find(p => p.id === 'a')?.ack === 2));
  assert.equal(room.members.get('a')!.connected, true); assert.notEqual(replacement.token, token);
  const publicMessages = JSON.stringify(otherMessages);
  assert.ok(!publicMessages.includes(token)); assert.ok(!publicMessages.includes(replacement.token));
  game.receive(a, { type: 'leave' }, 1003); game.disconnect(a, 1003);
  assert.equal(replacement.connected, true); assert.equal(replacement.room, room);
  game.receive(replacement, { type: 'inputs', inputs: [input(3)] }, 1003); room.tick(1003);
  assert.equal(player.ack, 3);
});

test('expired and already-rotated session tokens cannot take over a player', () => {
  const { game, a, room } = setup(), token = a.token;
  game.disconnect(a, 1001);
  const resumed = game.connect(() => {}, 'new', 1002); game.receive(resumed, { type: 'resume', token }, 1002);
  const rejected: ServerMessage[] = [], attacker = game.connect(m => rejected.push(m), 'attacker', 1003);
  game.receive(attacker, { type: 'resume', token }, 1003);
  assert.equal(attacker.id, 'attacker'); assert.equal(game.peers.get('a'), resumed);
  assert.ok(rejected.some(m => m.type === 'error' && m.code === 'resume_expired'));
  const renewedToken = resumed.token; game.disconnect(resumed, 1004); game.tick(1004 + RECONNECT_GRACE);
  assert.equal(room.members.has('a'), false); assert.equal(game.peers.has('a'), false);
  game.receive(attacker, { type: 'resume', token: renewedToken }, 1030); assert.equal(attacker.room, undefined);
});

test('explicit leave releases a room immediately; reconnect grace expires empty rooms', () => {
  const { game, a, b, room } = setup();
  game.receive(a, { type: 'leave' }, 1001); assert.equal(room.members.has('a'), false); assert.equal(a.room, undefined);
  game.disconnect(b, 1001); game.tick(1001 + RECONNECT_GRACE - .01); assert.equal(game.rooms.size, 1);
  game.tick(1001 + RECONNECT_GRACE); assert.equal(game.rooms.size, 0);
});

test('a valid live-session replacement makes old socket messages harmless', () => {
  const { game, a, room } = setup(), player = room.players.get('a')!;
  let closed = false; a.close = () => { closed = true; };
  const next = game.connect(() => {}, 'next', 1001); game.receive(next, { type: 'resume', token: a.token }, 1001);
  assert.equal(closed, true);
  game.receive(a, { type: 'inputs', inputs: [input(10)] }, 1002); game.disconnect(a, 1002);
  assert.equal(room.runtime.get('a')!.maxSeq, -1); assert.equal(next.connected, true); assert.equal(room.players.get('a'), player);
});

test('rate and payload limits reject floods without mutating room state', () => {
  const { game, a, room } = setup();
  game.receive(a, 'x'.repeat(32769), 1001); assert.equal(a.room, room);
  for (let i = 0; i < 151; i++) game.receive(a, { type: 'ping', time: 1001 }, 1001);
  game.receive(a, { type: 'leave' }, 1001); assert.equal(a.room, room);
  game.receive(a, { type: 'leave' }, 1002); assert.equal(a.room, undefined);
});

test('clock sync resists jitter, rejects malformed samples and never runs backward', () => {
  const clock = new NetworkClock();
  for (let index = 0; index < 4; index++) clock.synchronize(100 + index, 100.04 + index, 110.02 + index);
  assert.ok(Math.abs(clock.offset - 10) < .00001);
  clock.synchronize(104, 104.8, 114.02);
  assert.ok(Math.abs(clock.offset - 10) < .00001, 'a congested asymmetric ping cannot move the aiming timeline');
  assert.ok(clock.rtt > 40 && clock.rtt <= 800.001);
  const rtt = clock.rtt; clock.synchronize(105, 104, 115); clock.synchronize(NaN, 106, 116); assert.equal(clock.rtt, rtt);
  const before = clock.now(107); clock.offset -= .1; assert.equal(clock.now(107.01), before); assert.ok(clock.now(107.2) > before);
});
