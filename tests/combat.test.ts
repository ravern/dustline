import test from 'node:test';
import assert from 'node:assert/strict';
import { GameServer, RESPAWN_DELAY, validInput } from '../server/game.ts';
import { advanceGrenade, GRENADE_RADIUS } from '../server/grenades.ts';
import { containsMapPosition, getMap } from '../shared/map.ts';
import { route } from '../server/navigation.ts';
import { DT, spawnBody } from '../shared/physics.ts';
import { WEAPONS, weaponForSlot } from '../shared/weapons.ts';
import type { GameMode, GrenadeKind, GrenadeState, Input, SecondaryId } from '../shared/types.ts';

const command = (patch: Partial<Input> = {}): Input => ({ seq: 0, yaw: 0, pitch: 0, forward: 0, right: 0, jump: false, sprint: false, crouch: false, ads: true, fire: false, reload: false, slot: 0, time: 1000, ...patch });
function match(mode: GameMode = 'ffa', secondary: SecondaryId = 'm9') {
  const game = new GameServer();
  const a = game.connect(() => {}, 'a', 1000), b = game.connect(() => {}, 'b', 1000);
  game.receive(a, { type: 'create', name: 'Alpha', loadout: { primary: 'ak47', secondary }, bots: 0, mode }, 1000);
  const room = a.room!;
  game.receive(b, { type: 'join', code: room.code, name: 'Bravo', loadout: { primary: 'scar', secondary: 'm9' } }, 1000);
  game.receive(b, { type: 'ready', ready: true }, 1000); game.receive(a, { type: 'start' }, 1000);
  const shooter = room.players.get('a')!, target = room.players.get('b')!;
  shooter.body = spawnBody({ x: 26, y: 0, z: 0 }); target.body = spawnBody({ x: 26, y: 0, z: -10 });
  shooter.protectedUntil = target.protectedUntil = 0; shooter.nextFire = shooter.nextGrenade = 0;
  return { game, room, shooter, target, a, b };
}
function grenade(kind: GrenadeKind = 'frag', patch: Partial<GrenadeState> = {}): GrenadeState {
  return { id: 'grenade', kind, owner: 'a', team: null, position: { x: 26, y: .2, z: -10 }, velocity: { x: 0, y: 0, z: 0 }, thrownAt: 1000, detonateAt: 1002, ...patch };
}
function explode(setup: ReturnType<typeof match>, kind: GrenadeKind = 'frag', patch: Partial<GrenadeState> = {}, now = 1002) {
  const projectile = grenade(kind, { team: setup.shooter.team, ...patch });
  setup.room.grenades.set(projectile.id, projectile); setup.room.explodeGrenade(projectile, now);
  return projectile;
}

test('each secondary has independent magazine, reserve and slot selection', () => {
  for (const secondary of ['m9', 'deagle', 'glock'] as const) {
    const { shooter } = match('ffa', secondary);
    assert.equal(weaponForSlot(shooter.loadout, 0), 'ak47'); assert.equal(weaponForSlot(shooter.loadout, 1), secondary); assert.equal(weaponForSlot(shooter.loadout, 2), 'knife');
    assert.equal(shooter.ammo[1], WEAPONS[secondary].mag); assert.equal(shooter.reserve[1], WEAPONS[secondary].reserve);
  }
});

test('Glock 18 fires automatically while Desert Eagle requires trigger release', () => {
  for (const secondary of ['deagle', 'glock'] as const) {
    const { room, shooter, target } = match('ffa', secondary);
    shooter.slot = 1; target.protectedUntil = 2000;
    for (let seq = 0; seq < 60; seq++) { const now = 1000 + seq * DT; room.enqueue('a', [command({ seq, slot: 1, fire: true, time: now })], now); room.tick(now); }
    const spent = WEAPONS[secondary].mag - shooter.ammo[1];
    assert.equal(secondary === 'deagle' ? spent === 1 : spent >= 10, true);
    assert.equal(shooter.ammo[0], WEAPONS.ak47.mag);
  }
});

test('loadout edits are queued while alive and dead and only apply at the five-second respawn', () => {
  const { game, room, shooter, target } = match();
  shooter.ammo[0] = 3; shooter.ammo[1] = 2; shooter.grenades.frag = 0;
  game.receive('a', { type: 'loadout', loadout: { primary: 'intervention', secondary: 'deagle' } }, 1001);
  assert.deepEqual(room.members.get('a')!.loadout, { primary: 'intervention', secondary: 'deagle' });
  assert.deepEqual(shooter.loadout, { primary: 'ak47', secondary: 'm9' }); assert.deepEqual(shooter.ammo, [3, 2, 1]); assert.equal(shooter.grenades.frag, 0);
  room.damage(shooter, target, 150, 1002, { weapon: 'scar' });
  assert.equal(shooter.respawnAt, 1002 + RESPAWN_DELAY);
  game.receive('a', { type: 'loadout', loadout: { primary: 'scar', secondary: 'glock' } }, 1003);
  room.tick(1006.99); assert.equal(room.players.get('a')!.hp, 0);
  room.tick(1007); const fresh = room.players.get('a')!;
  assert.deepEqual(fresh.loadout, { primary: 'scar', secondary: 'glock' }); assert.deepEqual(fresh.ammo, [20, 19, 1]); assert.deepEqual(fresh.grenades, { frag: 1, flash: 1 }); assert.equal(fresh.deaths, 1);
});

test('invalid secondary and grenade input values cannot select arbitrary equipment', () => {
  const { game, room } = match();
  game.receive('a', { type: 'loadout', loadout: { primary: '__proto__', secondary: 'knife' } }, 1001);
  assert.deepEqual(room.members.get('a')!.loadout, { primary: 'intervention', secondary: 'm9' });
  const parsed = validInput({ ...command(), frag: 'true', flash: 1 })!;
  assert.equal(parsed.frag, false); assert.equal(parsed.flash, false);
});

test('grenades consume one per life, end protection and cannot repeat from held or duplicate commands', () => {
  const { room, shooter } = match(); shooter.protectedUntil = 2000;
  room.enqueue('a', [command({ seq: 0, frag: true }), command({ seq: 0, frag: true })], 1000); room.tick(1000);
  assert.equal(shooter.grenades.frag, 0); assert.equal(shooter.grenades.flash, 1); assert.equal(shooter.protectedUntil, 0);
  assert.equal(room.grenades.size, 1); assert.equal(room.shoot(shooter, command(), 1000), false);
  for (let seq = 1; seq <= 10; seq++) { room.enqueue('a', [command({ seq, frag: true, time: 1000 + seq * DT })], 1000 + seq * DT); room.tick(1000 + seq * DT); }
  room.enqueue('a', [command({ seq: 0, frag: true })], 1001);
  assert.equal(room.events.filter(e => e.type === 'grenade_throw').length, 1);
  room.enqueue('a', [command({ seq: 11, frag: false, flash: true, time: 1001 })], 1001); room.tick(1001);
  assert.equal(shooter.grenades.flash, 0); assert.equal(room.grenades.size, 2);
});

test('holding a grenade across death cannot throw the replenished grenade without releasing it', () => {
  const { room, shooter, target } = match();
  room.enqueue('a', [command({ seq: 0, frag: true })], 1000); room.tick(1000);
  room.damage(shooter, target, 200, 1001, { weapon: 'scar' });
  room.enqueue('a', [command({ seq: 1, frag: true, time: 1002 })], 1002);
  room.grenades.clear(); room.tick(1006);
  const fresh = room.players.get('a')!;
  room.enqueue('a', [command({ seq: 2, frag: true, time: 1007 })], 1007); room.tick(1007);
  assert.equal(fresh.grenades.frag, 1); assert.equal(room.grenades.size, 0);
  room.enqueue('a', [command({ seq: 3, frag: false, time: 1007.1 }), command({ seq: 4, frag: true, time: 1007.2 })], 1007.2); room.tick(1007.2);
  assert.equal(fresh.grenades.frag, 0); assert.equal(room.grenades.size, 1);
});

test('swept grenade collision stops tunneling through thin walls and projectiles settle above the floor', () => {
  const projectile = grenade('frag', { position: { x: 0, y: 1.2, z: 0 }, velocity: { x: 0, y: 0, z: -100 } });
  const map = { ...getMap('yard'), boxes: [{ x: 0, y: 2, z: -.4, w: 10, h: 4, d: .05, kind: 'testwall' }] };
  advanceGrenade(projectile, DT, map);
  assert.ok(projectile.position.z > -.295); assert.ok(projectile.velocity.z > 0);
  for (let tick = 0; tick < 600; tick++) advanceGrenade(projectile, DT, { ...map, boxes: [] });
  assert.ok(projectile.position.y >= GRENADE_RADIUS); assert.ok(projectile.position.y < GRENADE_RADIUS + .001); assert.ok(Math.hypot(projectile.velocity.x, projectile.velocity.z) < .01);
});

test('input catchup cannot accelerate grenade physics and fuse expiry removes exactly one projectile', () => {
  const { room } = match();
  const projectile = grenade('flash', { position: { x: 26, y: 10, z: 0 }, velocity: { x: 1, y: 0, z: 0 } });
  room.grenades.set(projectile.id, projectile);
  room.runtime.get('a')!.commandCredit = 8;
  room.enqueue('a', Array.from({ length: 8 }, (_, seq) => command({ seq })), 1000);
  room.tick(1000); assert.ok(Math.abs(projectile.position.x - (26 + DT)) < 1e-8);
  room.tick(1001.99); assert.equal(room.grenades.size, 1);
  room.tick(1002); room.tick(1003); room.explodeGrenade(projectile, 1003);
  assert.equal(room.grenades.size, 0); assert.equal(room.events.filter(e => e.type === 'grenade_explode').length, 1);
});

test('fragmentation kills use FFA/TDM scoring, five-second respawns and CTF flag drops', () => {
  for (const mode of ['ffa', 'tdm', 'ctf'] as const) {
    const setup = match(mode), { room, shooter, target } = setup;
    if (mode === 'ctf') room.flags.find(f => f.team === shooter.team)!.carrier = target.id;
    explode(setup);
    assert.equal(target.hp, 0); assert.equal(target.respawnAt, 1007); assert.equal(shooter.kills, 1); assert.equal(target.deaths, 1);
    assert.equal(room.events.find(e => e.type === 'kill')?.grenade, 'frag'); assert.equal(room.teamScores.red, mode === 'tdm' ? 1 : 0);
    if (mode === 'ctf') assert.equal(room.flags.find(f => f.team === shooter.team)!.carrier, null);
  }
});

test('grenade scoring respects match limits, teammates, spawn protection and self kills', () => {
  const winning = match('tdm'); winning.room.limit = 1; explode(winning); assert.equal(winning.room.winner, 'red'); assert.equal(winning.room.state, 'finished');
  const friendly = match('tdm'); friendly.target.team = friendly.shooter.team; explode(friendly); assert.equal(friendly.target.hp, 100);
  const protectedPlayer = match(); protectedPlayer.target.protectedUntil = 1003; explode(protectedPlayer); assert.equal(protectedPlayer.target.hp, 100);
  const suicide = match('tdm'); explode(suicide, 'frag', { position: { x: 26, y: .2, z: 0 } });
  assert.equal(suicide.shooter.hp, 0); assert.equal(suicide.shooter.kills, 0); assert.equal(suicide.room.teamScores.red, 0);
});

test('solid cover blocks fragmentation and flash effects', () => {
  for (const kind of ['frag', 'flash'] as const) {
    const setup = match(), { room, target } = setup;
    const wall = { x: 26, y: 2, z: -9, w: 3, h: 4, d: .1, kind: 'testwall' }; room.arena.boxes.push(wall);
    try { explode(setup, kind, { position: { x: 26, y: .6, z: -8 } }); assert.equal(target.hp, 100); assert.equal(target.flashUntil, 0); } finally { room.arena.boxes.pop(); }
  }
});

test('flash strength depends on distance and facing, expires and never inflicts damage', () => {
  const facing = match(), away = match(); facing.target.body.yaw = Math.PI; away.target.body.yaw = 0;
  explode(facing, 'flash', { position: { x: 26, y: 1.5, z: -8 } }); explode(away, 'flash', { position: { x: 26, y: 1.5, z: -8 } });
  assert.ok(facing.target.flashStrength > away.target.flashStrength * 2); assert.ok(facing.target.flashUntil > away.target.flashUntil); assert.equal(facing.target.hp, 100);
  assert.ok(facing.room.events.some(e => e.type === 'flash' && e.target === 'b' && e.duration! > 1));
  facing.room.tick(facing.target.flashUntil + .01); assert.equal(facing.target.flashUntil, 0); assert.equal(facing.target.flashStrength, 0);
});

test('grenade snapshots are detached and match transitions clear remaining projectiles', () => {
  const { room, shooter } = match(); room.throwGrenade(shooter, 'frag', 1000);
  const snapshot = room.snapshot(1000), originalX = [...room.grenades.values()][0].position.x;
  snapshot.grenades[0].position.x = -999; snapshot.players.find(p => p.id === shooter.id)!.grenades.flash = 0;
  assert.equal([...room.grenades.values()][0].position.x, originalX); assert.equal(shooter.grenades.flash, 1);
  room.finish(1001); room.returnToLobby(); assert.equal(room.grenades.size, 0);
});

test('throwing and vaulting keep hands unavailable for fire, ADS and reloads', () => {
  const { room, shooter } = match(); shooter.ammo[0] = 5;
  room.throwGrenade(shooter, 'frag', 1000);
  room.enqueue('a', [command({ seq: 0, ads: true, reload: true, fire: true, time: 1000.2 })], 1000.2); room.tick(1000.2);
  assert.equal(shooter.ads, false); assert.equal(shooter.reloading, 0); assert.equal(shooter.ammo[0], 5);
  room.enqueue('a', [command({ seq: 1, ads: true, time: 1000.5 })], 1000.5); room.tick(1000.5); assert.equal(shooter.ads, true);
  shooter.body.vault = { elapsed: 0, duration: .54, height: 1.2, from: { x: 26, y: 0, z: 0 }, to: { x: 26, y: 0, z: -2 } };
  shooter.nextFire = 0; shooter.reloading = 1003;
  assert.equal(room.throwGrenade(shooter, 'flash', 1001), false); assert.equal(room.shoot(shooter, command(), 1001), false);
  room.enqueue('a', [command({ seq: 2, ads: true, reload: true, fire: true, flash: true, time: 1001 })], 1001); room.tick(1001);
  assert.ok(shooter.body.vault); assert.equal(shooter.ads, false); assert.equal(shooter.reloading, 0); assert.equal(shooter.ammo[0], 5); assert.equal(shooter.grenades.flash, 1);
});

test('a bot route follows a concave footprint instead of cutting across missing ground', () => {
  const map = { ...getMap('yard'), size: 24, boxes: [], footprint: [{ x: -6, z: 0, w: 12, d: 24 }, { x: 6, z: 6, w: 12, d: 12 }] };
  const from = { x: -6, y: 0, z: -8 }, to = { x: 8, y: 0, z: 8 };
  const path = route(map, from, to); assert.ok(path.length > 5);
  let previous = from;
  for (const next of path) {
    for (let sample = 0; sample <= 10; sample++) {
      const t = sample / 10;
      assert.equal(containsMapPosition(map, previous.x + (next.x - previous.x) * t, previous.z + (next.z - previous.z) * t, .35), true);
    }
    previous = next;
  }
  assert.deepEqual(path.at(-1), to);
});

test('bots acquire each new target deliberately and leave pauses between automatic bursts', () => {
  const { room, shooter, target } = match(); shooter.bot = true;
  const rt = room.runtime.get('a')!; shooter.ads = true; shooter.adsSince = 999;
  const first = room.botInput(shooter, rt, 1000); assert.equal(first.fire, false); assert.ok(rt.botAcquireAt >= 1000.65);
  const samples: boolean[] = [];
  for (let tick = 1; tick < 180; tick++) {
    const next = room.botInput(shooter, rt, 1000 + tick * DT); samples.push(next.fire); shooter.body.yaw = next.yaw; shooter.body.pitch = next.pitch;
    if (tick * DT < .65) assert.equal(next.fire, false);
  }
  assert.ok(samples.some(Boolean)); assert.ok(samples.slice(90).filter(Boolean).length < 60, 'bursts include recovery pauses');
  target.body.z = -12; target.id = 'replacement';
  assert.equal(room.botInput(shooter, rt, 1004).fire, false); assert.ok(rt.botAcquireAt >= 1004.65);
});

test('flashed bots cannot keep firing accurately and sniper bots have longer initial reaction', () => {
  const { room, shooter } = match(); shooter.bot = true; shooter.loadout.primary = 'intervention'; shooter.ads = true; shooter.adsSince = 999;
  const rt = room.runtime.get('a')!; room.botInput(shooter, rt, 1000); assert.ok(rt.botAcquireAt >= 1001);
  shooter.flashStrength = 1; shooter.flashUntil = 1010;
  for (let tick = 60; tick < 180; tick++) assert.equal(room.botInput(shooter, rt, 1000 + tick * DT).fire, false);
});
