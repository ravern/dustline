import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, move, spawnBody, bodyHeight } from '../shared/physics.ts';
import { MAP_BOXES } from '../shared/map.ts';
import type { Body, Box, Input } from '../shared/types.ts';
const input = (patch: Partial<Input> = {}): Input => ({ seq: 1, yaw: 0, pitch: 0, forward: 0, right: 0, jump: false, sprint: false, crouch: false, ads: false, fire: false, reload: false, slot: 0, time: 0, ...patch });
function fixture(boxes: Box[], run: () => void) { const old = MAP_BOXES.splice(0); MAP_BOXES.push(...boxes); try { run(); } finally { MAP_BOXES.splice(0, MAP_BOXES.length, ...old); } }

test('jump has a decisive one-metre arc and lands in about half a second; holding jump never bunny hops', () => fixture([], () => {
  let body = spawnBody({ x: 0, y: 0, z: 0 }); let apex = 0, landed = 0;
  for (let i = 1; i <= 120; i++) { body = move(body, input({ jump: true })); apex = Math.max(apex, body.y); if (i > 1 && body.grounded && !landed) landed = i * DT; }
  assert.ok(apex > .95 && apex < 1.1, `apex ${apex}`); assert.ok(landed > .48 && landed < .56, `airtime ${landed}`);
  assert.equal(body.y, 0); body = move(body, input()); body = move(body, input({ jump: true })); assert.ok(body.vy > 0);
}));
test('sprint reaches 9m/s, diagonal input is normalized, and release stops promptly', () => fixture([], () => {
  let body = spawnBody({ x: 0, y: 0, z: 0 });
  for (let i = 0; i < 30; i++) body = move(body, input({ forward: 1, sprint: true }));
  assert.ok(Math.abs(Math.hypot(body.vx, body.vz) - 9) < .001);
  let diagonal = spawnBody({ x: 0, y: 0, z: 0 }); for (let i = 0; i < 30; i++) diagonal = move(diagonal, input({ forward: 1, right: 1, sprint: true }));
  assert.ok(Math.abs(Math.hypot(diagonal.vx, diagonal.vz) - 9) < .001);
  for (let i = 0; i < 9; i++) body = move(body, input()); assert.equal(Math.hypot(body.vx, body.vz), 0);
}));
test('slide requires sprint momentum, decays in 650ms and cannot retrigger while crouch is held', () => fixture([], () => {
  let body = spawnBody({ x: 0, y: 0, z: 0 });
  for (let i = 0; i < 20; i++) body = move(body, input({ forward: 1, sprint: true }));
  body = move(body, input({ forward: 1, sprint: true, crouch: true })); assert.equal(body.stance, 'slide'); assert.ok(Math.hypot(body.vx, body.vz) > 11);
  const start = body.z; for (let i = 0; i < 40; i++) body = move(body, input({ forward: 1, sprint: true, crouch: true }));
  assert.equal(body.stance, 'crouch'); assert.ok(start - body.z > 5 && start - body.z < 6.2);
  for (let i = 0; i < 100; i++) body = move(body, input({ forward: 1, sprint: true, crouch: true })); assert.equal(body.stance, 'crouch');
}));
test('solid walls stop sprinting and diagonal movement can slide along them', () => fixture([{ x: 0, y: 2, z: -3, w: 10, h: 4, d: 1, kind: 'wall' }], () => {
  let body = spawnBody({ x: 0, y: 0, z: 0 });
  for (let i = 0; i < 120; i++) body = move(body, input({ forward: 1, sprint: true }));
  assert.ok(body.z >= -2.1501 && body.z < -2.1); assert.equal(body.vz, 0);
  for (let i = 0; i < 20; i++) body = move(body, input({ forward: 1, right: 1 })); assert.ok(body.x > .5); assert.ok(body.z >= -2.1501);
}));
test('walkable steps climb, tall ledges block and overhead ceilings cancel jump velocity', () => fixture([
  { x: 0, y: .2, z: -2, w: 3, h: .4, d: 2, kind: 'step' },
  { x: 0, y: 1.2, z: -5, w: 3, h: 2.4, d: 1, kind: 'wall' },
  { x: 7, y: 2, z: 0, w: 3, h: .2, d: 3, kind: 'ceiling' }
], () => {
  let b = spawnBody({ x: 0, y: 0, z: 0 }); for (let i = 0; i < 20; i++) b = move(b, input({ forward: 1 })); assert.ok(b.y >= .399); assert.ok(b.grounded);
  for (let i = 0; i < 80; i++) b = move(b, input({ forward: 1 })); assert.ok(b.z > -4.151);
  b = spawnBody({ x: 7, y: 0, z: 0 }); for (let i = 0; i < 8; i++) b = move(b, input({ jump: true })); assert.ok(b.y + bodyHeight(b) <= 1.9001); assert.ok(b.vy <= 0);
}));
test('crouched players cannot stand through low ceilings', () => fixture([{ x: 0, y: 1.5, z: 0, w: 4, h: .4, d: 4, kind: 'ceiling' }], () => {
  const b = { ...spawnBody({ x: 0, y: 0, z: 0 }), stance: 'crouch' as const }; assert.equal(move(b, input()).stance, 'crouch');
}));
test('lower rig stairs are walkable without jumping', () => {
  let b = spawnBody({ x: 2.8, y: 0, z: 12 }); let highest = 0;
  for (let i = 0; i < 115; i++) { b = move(b, input({ forward: 1 })); highest = Math.max(highest, b.y); }
  assert.ok(highest >= 3.29, `reached ${highest}`);
});
test('upper rig stairs connect the first deck to the top deck', () => {
  let b = { ...spawnBody({ x: -2.8, y: 3.6, z: 3.4 }), grounded: true }; let highest = b.y;
  for (let i = 0; i < 100; i++) { b = move(b, input({ forward: 1 })); highest = Math.max(highest, b.y); }
  assert.ok(highest >= 6.59, `reached ${highest}, ended at ${JSON.stringify(b)}`);
});

test('slide has a lower body and eye position than crouch and only exits when there is headroom', () => fixture([
  { x: 0, y: 1.1, z: 0, w: 3, h: .4, d: 3, kind: 'ceiling' }
], () => {
  let b:Body = { ...spawnBody({ x: 0, y: 0, z: 0 }), stance: 'slide', slideTime: .01 };
  assert.equal(bodyHeight(b), .8);
  b = move(b, input());
  assert.equal(b.stance, 'slide'); assert.ok(b.y + bodyHeight(b) <= .9);
  // Expiring under cover must still allow escape; the player is never trapped in
  // a zero-momentum slide or pushed through the ceiling when crouch is released.
  let moving = b;
  for (let i = 0; i < 80; i++) moving = move(moving, input({ right: 1 }));
  assert.ok(moving.x > 2); assert.equal(moving.stance, 'stand');
}));

test('crouch reduces movement speed and releasing it immediately restores standing when clear', () => fixture([], () => {
  let b = spawnBody({ x: 0, y: 0, z: 0 });
  for(let i=0;i<30;i++)b=move(b,input({forward:1,crouch:true,sprint:true}));
  assert.equal(b.stance,'crouch');assert.equal(bodyHeight(b),1.05);assert.ok(Math.abs(Math.hypot(b.vx,b.vz)-3)<.001);
  b=move(b,input());assert.equal(b.stance,'stand');assert.equal(b.y,0);
}));
