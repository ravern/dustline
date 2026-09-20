import test from 'node:test';
import assert from 'node:assert/strict';
import { GameServer } from '../server/game.ts';
import { decodeServerMessage, encodeSnapshot } from '../shared/wire.ts';
import type { GameEvent, GameMode, Snapshot } from '../shared/types.ts';

function snapshot(mode: GameMode): Snapshot {
  const game = new GameServer(), host = game.connect(() => {}, 'codec-host', 1000);
  game.receive(host, { type: 'create', name: 'Codec Ω "test"', loadout: { primary: 'scar', secondary: 'deagle' }, bots: 31, mode }, 1000);
  game.receive(host, { type: 'start' }, 1000);
  return host.room!.snapshot(1001.123456789);
}
const canonical = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test('all modes and32 players round-trip losslessly with materially smaller self-contained snapshots', () => {
  for (const mode of ['ffa', 'tdm', 'ctf'] as const) {
    const original = snapshot(mode);
    assert.equal(original.players.length, 32);
    const encoded = encodeSnapshot(original), decoded = decodeServerMessage(encoded);
    assert.deepEqual(decoded, canonical(original));
    assert.ok(Buffer.byteLength(encoded) < Buffer.byteLength(JSON.stringify(original)) * .6);
    // There is no previous-frame state: skipped frames and arbitrary reconnects
    // decode identically on a brand-new decoder invocation.
    original.tick += 9000; original.time += 450; original.players.reverse();
    assert.deepEqual(decodeServerMessage(encodeSnapshot(original)), canonical(original));
  }
});

test('prediction precision, vault trajectories, live inventories, flags and every event field survive', () => {
  const original = snapshot('ctf'), player = original.players[0];
  Object.assign(player, { hp: 37, kills: 3, deaths: 4, captures: 2, slot: 1, ammo: [0, 3, 1], reserve: [60, 14, 0], reloading: 1002.87654321, nextFire: 1001.3456789, ads: true, adsSince: 1000.3333333, ack: Number.MAX_SAFE_INTEGER - 3, respawnAt: 1006.98, protectedUntil: 1002.01, lastDamage: 1001.1, grenades: { frag: 0, flash: 1 }, nextGrenade: 1001.75, flashUntil: 1003.3333333, flashStrength: .987654321 });
  Object.assign(player.body, { x: Math.PI, y: Number.MIN_VALUE, z: -13.87654321, vx: -4.87654321098765, vy: 2.3333333333333335, vz: 1.25, yaw: -Math.PI, pitch: 1.456789, grounded: false, stance: 'slide', slideTime: .45678, slideCooldown: 1.54321, jumpHeld: true, crouchHeld: true, vault: { elapsed: .123456789, duration: .54, from: { x: -5, y: 0, z: 4 }, to: { x: -4, y: 1.5, z: 3 }, height: 1.23456789 } });
  original.players[1].loadout.secondary = 'glock'; original.players[2].loadout.secondary = 'm9';
  original.flags[0].carrier = player.id; original.flags[1].position = { x: -4.2, y: 3.2, z: 13.7 }; original.flags[1].returnAt = 1021.2345;
  original.grenades = original.players.flatMap((p, index) => (['frag', 'flash'] as const).map(kind => ({ id: `${p.id}-${kind}`, kind, owner: p.id, team: p.team, position: { x: index + .123456789, y: 1.9876543, z: -index }, velocity: { x: -4.567890123, y: 10.6666666666667, z: 3.456789012 }, thrownAt: 1001.01, detonateAt: 1002.51 })));
  const types: GameEvent['type'][] = ['shot', 'hit', 'kill', 'respawn', 'start', 'end', 'flag_pickup', 'flag_drop', 'flag_return', 'flag_capture', 'grenade_throw', 'grenade_explode', 'flash'];
  original.events = types.map((type, index) => ({ id: index + 1, type, time: 1001.12345 + index / 60 }));
  original.events.push({ id: 99, type: 'hit', player: player.id, target: original.players[1].id, weapon: 'deagle', grenade: 'frag', grenadeId: 'gone-projectile', strength: 0, duration: 2.5, damage: 0, headshot: false, quickscope: false, from: { x: 0, y: .123, z: -1 }, to: { x: 2, y: 3, z: 4 }, team: 'red', time: 1001.99 });
  original.state = 'finished'; original.winner = 'blue'; original.teamScores = { red: 2, blue: 3 };
  const decoded = decodeServerMessage(encodeSnapshot(original));
  assert.deepEqual(decoded, canonical(original));
  assert.ok(Buffer.byteLength(encodeSnapshot(original)) < Buffer.byteLength(JSON.stringify(original)) * .65);
});

test('legacy objects and private handshake messages retain their complete original structure', () => {
  for (const message of [snapshot('ffa'), { type: 'welcome', id: 'private-player', token: 'unicast-token', resumed: true, serverTime: 1001.123 }, { type: 'error', code: 'resume_expired', message: 'Expired' }, { type: 'pong', time: 900.5, serverTime: 1000.5 }]) {
    assert.deepEqual(decodeServerMessage(JSON.stringify(message)), canonical(message));
  }
  const encoded = encodeSnapshot(snapshot('ffa'));
  assert.ok(!encoded.includes('token'));
});

test('invalid versions and truncated positional rows fail closed without throwing into the frame loop', () => {
  const valid = JSON.parse(encodeSnapshot(snapshot('ctf')));
  for (const invalid of ['{', 'null', '42', '{}', '[]', '["s2"]']) assert.equal(decodeServerMessage(invalid), undefined);
  const mutations = [
    (v: any[]) => v.pop(),
    (v: any[]) => v[4][0].pop(),
    (v: any[]) => v[4][0][4].pop(),
    (v: any[]) => v[4][0][4][14] = [.1],
    (v: any[]) => v[5] = [[1]],
    (v: any[]) => v[6] = [[1, 'shot', 1000, 1]],
    (v: any[]) => v[6] = [[1, 'shot', 1000, -1]],
    (v: any[]) => v[12][0][1].pop(),
  ];
  for (const mutate of mutations) { const broken = canonical(valid); mutate(broken); assert.equal(decodeServerMessage(JSON.stringify(broken)), undefined); }
});
