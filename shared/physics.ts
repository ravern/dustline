import { MAP_BOXES, MAP_SIZE } from './map.ts';
import type { Body, Box, Input, Vec3 } from './types.ts';

export const DT = 1 / 60;
export const PLAYER_RADIUS = 0.35;
const EPS = 0.00001;
const GRAVITY = 32;
const JUMP = 8.4;
export const bodyHeight = (b: Body) => b.stance === 'stand' ? 1.75 : 1.05;
export const eyeHeight = (b: Body) => b.stance === 'stand' ? 1.6 : 0.9;
export function spawnBody(p: Vec3, yaw = 0): Body {
  return { ...p, vx: 0, vy: 0, vz: 0, yaw, pitch: 0, grounded: p.y <= EPS, stance: 'stand', slideTime: 0, slideCooldown: 0, jumpHeld: false, crouchHeld: false };
}
const approach = (value: number, goal: number, amount: number) => value < goal ? Math.min(goal, value + amount) : Math.max(goal, value - amount);
const overlap = (a: number, b: number, c: number, d: number) => a < d - EPS && b > c + EPS;
function intersects(b: Body, box: Box, height = bodyHeight(b)): boolean {
  return overlap(b.x - PLAYER_RADIUS, b.x + PLAYER_RADIUS, box.x - box.w / 2, box.x + box.w / 2) && overlap(b.y, b.y + height, box.y - box.h / 2, box.y + box.h / 2) && overlap(b.z - PLAYER_RADIUS, b.z + PLAYER_RADIUS, box.z - box.d / 2, box.z + box.d / 2);
}
function canOccupy(b: Body, height = bodyHeight(b)) { return !MAP_BOXES.some(box => intersects(b, box, height)); }

/** Shared deterministic fixed-step movement. Position is at the player's feet. */
export function move(body: Body, input: Input, dt = DT): Body {
  const b = { ...body };
  dt = Math.max(0, Math.min(dt, 1 / 30));
  b.yaw = input.yaw;
  b.pitch = Math.max(-1.48, Math.min(1.48, input.pitch));
  b.slideCooldown = Math.max(0, b.slideCooldown - dt);
  const jumpPressed = input.jump && !body.jumpHeld;
  const crouchPressed = input.crouch && !body.crouchHeld;
  b.jumpHeld = input.jump;
  b.crouchHeld = input.crouch;
  const speedBefore = Math.hypot(b.vx, b.vz);
  if (crouchPressed && input.sprint && b.grounded && speedBefore >= 6 && b.slideCooldown === 0) {
    b.stance = 'slide'; b.slideTime = .65; b.slideCooldown = 1.25;
    b.vx = b.vx / speedBefore * 12; b.vz = b.vz / speedBefore * 12;
  }
  if (b.stance === 'slide') {
    b.slideTime = Math.max(0, b.slideTime - dt);
    if (b.slideTime <= 0 || !b.grounded) b.stance = 'crouch';
  }
  if (b.stance !== 'slide') {
    if (input.crouch) b.stance = 'crouch';
    else if (canOccupy(b, 1.75)) b.stance = 'stand';
    else b.stance = 'crouch';
  }
  if (jumpPressed && b.grounded) {
    b.vy = JUMP; b.grounded = false; b.slideTime = 0;
    if (!input.crouch && canOccupy(b, 1.75)) b.stance = 'stand';
    else b.stance = 'crouch';
  }
  const f = Math.max(-1, Math.min(1, input.forward));
  const r = Math.max(-1, Math.min(1, input.right));
  const norm = Math.max(1, Math.hypot(f, r));
  const dx = (-Math.sin(b.yaw) * f + Math.cos(b.yaw) * r) / norm;
  const dz = (-Math.cos(b.yaw) * f - Math.sin(b.yaw) * r) / norm;
  if (b.stance === 'slide' && b.grounded) {
    const currentSpeed = Math.hypot(b.vx, b.vz) || 1;
    const speed = 6 + 6 * b.slideTime / .65;
    // A little steering while preserving momentum makes sliding useful around cover.
    b.vx = (b.vx / currentSpeed * .985 + dx * .015) * speed;
    b.vz = (b.vz / currentSpeed * .985 + dz * .015) * speed;
  } else {
    const speed = b.stance === 'crouch' ? 3 : input.ads ? 3.6 : input.sprint && f > 0 ? 9 : 6;
    const acceleration = b.grounded ? 70 : 20;
    // Acceleration is vector limited, avoiding faster diagonal movement.
    const vx = dx * speed - b.vx, vz = dz * speed - b.vz;
    const delta = Math.hypot(vx, vz);
    const factor = delta > 0 ? Math.min(1, acceleration * dt / delta) : 0;
    b.vx += vx * factor; b.vz += vz * factor;
  }
  // Axis sweeps prevent wall tunneling. Low ledges step up only from stable ground.
  const wasGrounded = b.grounded;
  for (const axis of ['x', 'z'] as const) {
    const velocity = axis === 'x' ? 'vx' : 'vz';
    b[axis] += b[velocity] * dt;
    for (const box of MAP_BOXES) {
      if (!intersects(b, box)) continue;
      const top = box.y + box.h / 2;
      if (wasGrounded && top >= b.y - EPS && top - b.y <= .42) {
        const elevated = { ...b, y: top + EPS };
        if (canOccupy(elevated)) { b.y = top + EPS; continue; }
      }
      const size = axis === 'x' ? box.w : box.d;
      if (b[velocity] > 0) b[axis] = box[axis] - size / 2 - PLAYER_RADIUS - EPS;
      else if (b[velocity] < 0) b[axis] = box[axis] + size / 2 + PLAYER_RADIUS + EPS;
      b[velocity] = 0;
    }
    const bound = MAP_SIZE / 2 - PLAYER_RADIUS;
    if (Math.abs(b[axis]) > bound) { b[axis] = Math.max(-bound, Math.min(bound, b[axis])); b[velocity] = 0; }
  }
  const oldY = b.y;
  b.vy -= GRAVITY * dt;
  b.y += b.vy * dt;
  b.grounded = false;
  for (const box of MAP_BOXES) {
    if (!intersects(b, box)) continue;
    const top = box.y + box.h / 2;
    const bottom = box.y - box.h / 2;
    if (b.vy <= 0 && oldY >= top - .04) { b.y = top; b.vy = 0; b.grounded = true; }
    else if (b.vy > 0 && oldY + bodyHeight(b) <= bottom + .04) { b.y = bottom - bodyHeight(b); b.vy = 0; }
  }
  if (b.y <= 0) { b.y = 0; b.vy = 0; b.grounded = true; }
  return b;
}
