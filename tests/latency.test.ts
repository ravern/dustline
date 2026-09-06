import test from 'node:test';
import assert from 'node:assert/strict';
import { GameServer, MAX_COMMAND_CREDIT, Room, validInput } from '../server/game.ts';
import { DT, move, spawnBody } from '../shared/physics.ts';
import type { Body, Input } from '../shared/types.ts';

const command = (seq = 0, overrides: Partial<Input> = {}): Input => ({ seq, yaw: 0, pitch: 0, forward: 0, right: 0, jump: false, sprint: false, crouch: false, ads: false, fire: false, reload: false, slot: 0, time: 100, ...overrides });

function arena() {
  const game = new GameServer();
  const a = game.connect(() => {}), b = game.connect(() => {});
  const room = new Room(game, 'TEST1', a.id, 'Latency test', false);
  game.rooms.set(room.code, room);
  room.bots = 0;
  room.add(a, 'Shooter', { primary: 'ak47', secondary: 'm9' }, 100);
  room.add(b, 'Target', { primary: 'scar', secondary: 'm9' }, 100);
  room.members.get(b.id)!.ready = true;
  room.start(100);
  const shooter = room.players.get(a.id)!, target = room.players.get(b.id)!;
  shooter.body = spawnBody({ x: 0, y: 0, z: 25 });
  target.body = spawnBody({ x: 0, y: 0, z: 15 });
  shooter.nextFire = 0; shooter.ads = true; shooter.adsSince = 99;
  shooter.protectedUntil = 0; target.protectedUntil = 0;
  shooter.lastDamage = 100; target.lastDamage = 100;
  room.runtime.get(a.id)!.last = command(-1);
  room.runtime.get(b.id)!.last = command(-1);
  return { game, room, shooter, target };
}

function record(room: Room, id: string, time: number, x: number, stance: Body['stance'] = 'stand', z = 15) {
  const body = { ...spawnBody({ x, y: 0, z }), stance };
  room.runtime.get(id)!.history.push({ time, body, hp: 100, protectedUntil: 0 });
}

test('a hitscan shot tests the interpolated historical target position', () => {
  const { room, shooter, target } = arena();
  target.body.x = 2;
  record(room, target.id, 99.8, -2);
  record(room, target.id, 100, 2);
  assert.ok(Math.abs(room.historicalBody(target.id, 99.9)!.body.x) < 1e-9);
  assert.equal(room.shoot(shooter, command(0, { time: 100 }), 100), true);
  assert.ok(target.hp < 100, 'the visible target was centered at t=99.9 even though its current position is off the ray');
});

test('untrusted old timestamps cannot rewind farther than 400 ms', () => {
  const { room, shooter, target } = arena();
  target.body.x = 8;
  record(room, target.id, 99.45, 0);
  record(room, target.id, 99.6, 4);
  record(room, target.id, 100, 8);
  room.shoot(shooter, command(0, { time: 100, viewTime: 1 }), 100);
  assert.equal(target.hp, 100, 'the target from 550 ms ago must not be hittable');
});

test('the oldest permitted 400 ms target position remains hittable', () => {
  const { room, shooter, target } = arena();
  target.body.x = 8;
  record(room, target.id, 99.6, 0);
  record(room, target.id, 100, 8);
  room.shoot(shooter, command(0, { time: 100, viewTime: 1 }), 100);
  assert.ok(target.hp < 100);
});

test('a 250 ms RTT shot hits the opponent timestamp actually shown by adaptive interpolation', () => {
  const { room, shooter, target } = arena();
  target.body.x = 8;
  // At creation time 100, 125 ms one-way transit plus 75 ms buffering puts the
  // rendered target at 99.8. The input reaches the server at 100.125.
  record(room, target.id, 99.8, 0);
  record(room, target.id, 99.9, 4);
  record(room, target.id, 100.125, 8);
  room.shoot(shooter, command(0, { time: 100, viewTime: 99.8 }), 100.125);
  assert.ok(target.hp < 100, 'the 325 ms-old visible target is hittable even though the old 100 ms interpolation assumption would miss');
});

test('view timestamps must be finite and cannot exceed command creation time', () => {
  assert.equal(validInput(command(0, { viewTime: NaN })), null);
  assert.equal(validInput(command(0, { viewTime: Infinity })), null);
  assert.equal(validInput(command(0, { viewTime: 1e13 })), null);
  assert.equal(validInput(command(0, { time: 100, viewTime: 101 }))!.viewTime, 100);
  assert.equal(validInput(command(0, { time: 100, viewTime: 99.8 }))!.viewTime, 99.8);
  assert.equal(validInput(command())!.viewTime, undefined);

  const { room, shooter, target } = arena();
  target.body.x = 4;
  record(room, target.id, 100, 4);
  record(room, target.id, 100.1, 0);
  room.shoot(shooter, command(0, { time: 100, viewTime: 100.1 }), 100.1);
  assert.equal(target.hp, 100, 'a forged view after command creation must not select a newer target position');
});

test('a future timestamp is clamped to current target state', () => {
  const { room, shooter, target } = arena();
  record(room, target.id, 99.75, 5);
  record(room, target.id, 100, 0);
  room.shoot(shooter, command(0, { time: 101 }), 100);
  assert.ok(target.hp < 100);
});

test('rewind preserves historical stance and static cover occlusion', () => {
  const standing = arena();
  standing.target.body.stance = 'crouch';
  record(standing.room, standing.target.id, 99.9, 0, 'stand');
  standing.room.shoot(standing.shooter, command(), 100);
  assert.ok(standing.target.hp < 100, 'a standing historical hitbox reaches the aim ray');

  const crouching = arena();
  record(crouching.room, crouching.target.id, 99.9, 0, 'crouch');
  crouching.room.shoot(crouching.shooter, command(), 100);
  assert.equal(crouching.target.hp, 100, 'a crouched historical hitbox remains below the aim ray');

  const cover = arena();
  cover.shooter.body.z = 8;
  cover.target.body.z = -15;
  record(cover.room, cover.target.id, 99.9, 0, 'stand', -15);
  cover.room.shoot(cover.shooter, command(), 100);
  assert.equal(cover.target.hp, 100, 'the generator between shooter and historical target blocks the ray');
});

test('respawning discards previous-life hitbox history', () => {
  const { room, target } = arena();
  record(room, target.id, 99.9, 0);
  room.createPlayer(target.id, false, 100.1);
  assert.equal(room.historicalBody(target.id, 99.9), null);
});

test('duplicate, stale, malformed, and flooded inputs are bounded', () => {
  const { room, shooter } = arena();
  const runtime = room.runtime.get(shooter.id)!;
  room.enqueue(shooter.id, [command(0), command(0), command(1), command(0)], 100);
  assert.deepEqual(runtime.queue.map(i => i.seq), [0, 1]);
  assert.equal(validInput(command(2, { yaw: NaN })), null);
  assert.equal(validInput(command(2, { time: Infinity })), null);
  assert.equal(validInput(command(-1)), null);
  const clamped = validInput(command(2, { forward: 500, right: -500, pitch: 500 }))!;
  assert.equal(clamped.forward, 1); assert.equal(clamped.right, -1); assert.equal(clamped.pitch, 1.48);
  for (let start = 2; start < 74; start += 12) room.enqueue(shooter.id, Array.from({ length: 12 }, (_, i) => command(start + i)), 100);
  assert.ok(runtime.queue.length <= 30);
  assert.ok(runtime.maxSeq < 100000);
});

test('acknowledged snapshots match their input prefix with latency and ordered jitter', () => {
  for (const rtt of [0, .08, .16, .25]) {
    const { room, shooter } = arena();
    const initial = { ...shooter.body };
    const inputs = Array.from({ length: 48 }, (_, seq) => command(seq, { time: 100 + seq * DT, forward: seq < 30 ? 1 : 0, sprint: seq < 18 }));
    const expected: Body[] = [];
    let replay = initial;
    for (const input of inputs) { replay = move(replay, input); expected.push(replay); }
    let previousDelivery = 0;
    const messages = inputs.map((input, seq) => {
      // TCP preserves order even when the simulated transit time varies.
      previousDelivery = Math.max(previousDelivery, (seq + 1) * DT + rtt / 2 + [0, .02, -.01, .015][seq % 4]);
      return { input, delivery: previousDelivery };
    });
    for (let tick = 1; tick <= 100; tick++) {
      const elapsed = tick * DT;
      while (messages.length && messages[0].delivery <= elapsed + 1e-9) room.enqueue(shooter.id, [messages.shift()!.input], 100 + elapsed);
      room.tick(100 + elapsed);
      const snapshot = room.snapshot(100 + elapsed).players.find(p => p.id === shooter.id)!;
      const authoritativePrefix = snapshot.ack < 0 ? initial : expected[snapshot.ack];
      const error = Math.hypot(snapshot.body.x - authoritativePrefix.x, snapshot.body.y - authoritativePrefix.y, snapshot.body.z - authoritativePrefix.z);
      assert.ok(error < .000001, `${rtt * 1000} ms RTT tick ${tick}, ack ${snapshot.ack}: ${error.toFixed(6)} m unacknowledged motion`);
    }
    assert.equal(shooter.ack, inputs.length - 1);
  }
});

test('earned command credit drains a 100 ms delivery gap without permanent input debt', () => {
  const { room, shooter } = arena();
  const runtime = room.runtime.get(shooter.id)!;
  const expected: Body[] = [];
  let replay = { ...shooter.body };
  const delayed: Input[] = [];
  for (let tick = 1; tick <= 90; tick++) {
    const latest = command(tick - 1, { time: 100 + tick * DT, forward: 1 });
    replay = move(replay, latest);
    expected.push(replay);
    const delivery: Input[] = [];
    if (tick % 2 === 0) {
      const batch = [command(tick - 2, { time: 100 + (tick - 1) * DT, forward: 1 }), latest];
      if (tick >= 61 && tick <= 66) delayed.push(...batch);
      else delivery.push(...batch);
    }
    if (tick === 67) delivery.unshift(...delayed);
    if (delivery.length) room.enqueue(shooter.id, delivery, 100 + tick * DT);
    room.tick(100 + tick * DT);
    if (shooter.ack >= 0) assert.deepEqual(shooter.body, expected[shooter.ack], `tick ${tick} must retain exact prefix equivalence`);
    if (tick >= 68 && tick % 2 === 0) {
      assert.equal(shooter.ack, tick - 1, `tick ${tick} must acknowledge the newly delivered batch`);
      assert.equal(runtime.queue.length, 0);
    }
    assert.ok(shooter.ack + 1 <= tick, 'movement cannot run ahead of elapsed server ticks');
  }
});

test('flooded input cannot consume more movement steps than elapsed server ticks', () => {
  const { room, shooter } = arena();
  const runtime = room.runtime.get(shooter.id)!;
  let expected = { ...shooter.body };
  for (let tick = 1; tick <= 90; tick++) {
    const start = runtime.maxSeq + 1;
    room.enqueue(shooter.id, Array.from({ length: 12 }, (_, index) => command(start + index, { forward: 1 })), 100 + tick * DT);
    room.tick(100 + tick * DT);
    expected = move(expected, command(tick - 1, { forward: 1 }));
    assert.equal(shooter.ack + 1, tick);
    assert.deepEqual(shooter.body, expected);
    assert.ok(runtime.queue.length <= 30);
  }

  const idle = arena();
  for (let tick = 1; tick <= 60; tick++) idle.room.tick(100 + tick * DT);
  assert.equal(idle.room.runtime.get(idle.shooter.id)!.commandCredit, MAX_COMMAND_CREDIT);
  idle.room.enqueue(idle.shooter.id, Array.from({ length: 12 }, (_, index) => command(index, { forward: 1 })), 101 + DT);
  idle.room.tick(101 + DT);
  assert.equal(idle.shooter.ack + 1, MAX_COMMAND_CREDIT, 'idle time cannot bank an unlimited movement burst');
  idle.room.createPlayer(idle.shooter.id, false, 102);
  assert.equal(idle.room.runtime.get(idle.shooter.id)!.commandCredit, 0, 'a new life starts with no saved credit');
});

test('queued fire uses its own position, aim and weapon before a later slot switch', () => {
  const { room, shooter, target } = arena();
  for (let tick = 1; tick <= 6; tick++) room.tick(100 + tick * DT);
  const first = command(0, { forward: 1, ads: true, fire: true, time: 100 + 7 * DT });
  const shotBody = move(shooter.body, first);
  room.enqueue(shooter.id, [first, command(1, { forward: 1, slot: 1, yaw: Math.PI / 2 }), command(2, { slot: 1, yaw: Math.PI / 2, fire: true })], 100 + 7 * DT);
  room.tick(100 + 7 * DT);
  const shots = room.events.filter(event => event.type === 'shot' && event.player === shooter.id);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].weapon, 'ak47');
  assert.equal(shots[0].from!.x, shotBody.x);
  assert.equal(shots[0].from!.z, shotBody.z);
  assert.ok(shots[0].to!.z < shots[0].from!.z, 'the shot uses the earlier northward aim');
  assert.ok(target.hp < 100);
  assert.equal(shooter.slot, 1);
  assert.equal(shooter.body.yaw, Math.PI / 2);
  assert.equal(shooter.ammo[0], 29);
  assert.equal(shooter.ammo[1], 15, 'the new pistol stays locked during its switch delay');
});

test('catchup preserves fire edges without accelerating fire cooldowns, healing or history', () => {
  const { room, shooter } = arena();
  for (let tick = 1; tick <= 8; tick++) room.tick(100 + tick * DT);
  shooter.hp = 50;
  shooter.lastDamage = 90;
  const historyBefore = room.runtime.get(shooter.id)!.history.length;
  room.enqueue(shooter.id, Array.from({ length: 8 }, (_, seq) => command(seq, { ads: true, fire: seq % 2 === 0 })), 100 + 9 * DT);
  room.tick(100 + 9 * DT);
  assert.equal(shooter.ack, 7);
  assert.equal(shooter.ammo[0], 29, 'all catchup commands share server time and cannot bypass weapon cooldown');
  assert.ok(Math.abs(shooter.hp - (50 + 25 * DT)) < 1e-9, 'health advances once per server tick');
  assert.equal(room.runtime.get(shooter.id)!.history.length, historyBefore + 1);
  assert.equal(room.runtime.get(shooter.id)!.fireHeld, false, 'the final release edge remains applied');
});
