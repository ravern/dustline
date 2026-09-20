import { collisionIndex } from '../shared/collision.ts';
import type { MapDefinition } from '../shared/map.ts';
import type { Box, GrenadeKind, GrenadeState, Vec3 } from '../shared/types.ts';

export const GRENADE_RADIUS = .08;
export const GRENADE_FUSE: Record<GrenadeKind, number> = { frag: 2.4, flash: 1.5 };
export const FRAG_RADIUS = 8;
export const FLASH_RADIUS = 16;

/** Sweeping against expanded boxes prevents small projectiles crossing thin walls. */
function sweepBox(position: Vec3, delta: Vec3, box: Box): { time: number; normal: Vec3 } | null {
  let entry = -Infinity, exit = Infinity;
  const normal = { x: 0, y: 0, z: 0 };
  for (const [axis, size] of [['x', 'w'], ['y', 'h'], ['z', 'd']] as const) {
    const min = box[axis] - box[size] / 2 - GRENADE_RADIUS;
    const max = box[axis] + box[size] / 2 + GRENADE_RADIUS;
    if (Math.abs(delta[axis]) < 1e-10) {
      if (position[axis] < min || position[axis] > max) return null;
      continue;
    }
    const a = (min - position[axis]) / delta[axis], b = (max - position[axis]) / delta[axis];
    const near = Math.min(a, b);
    if (near > entry) { entry = near; normal.x = normal.y = normal.z = 0; normal[axis] = delta[axis] > 0 ? -1 : 1; }
    exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return null;
  }
  return entry >= -1e-8 && entry <= 1 && exit >= 0 ? { time: Math.max(0, entry), normal } : null;
}

/** Fixed server-time step; input batches never advance projectile time. */
export function advanceGrenade(grenade: GrenadeState, dt: number, map: MapDefinition, index=collisionIndex(map)) {
  const p = grenade.position, v = grenade.velocity;
  v.y -= 20 * dt;
  let remaining = dt;
  for (let bounce = 0; bounce < 4 && remaining > 1e-6; bounce++) {
    const delta = { x: v.x * remaining, y: v.y * remaining, z: v.z * remaining };
    let hit: { time: number; normal: Vec3 } | null = null;
    if (delta.y < 0 && p.y + delta.y < GRENADE_RADIUS) {
      hit = { time: Math.max(0, (GRENADE_RADIUS - p.y) / delta.y), normal: { x: 0, y: 1, z: 0 } };
    }
    for (const box of index.query(Math.min(p.x,p.x+delta.x)-GRENADE_RADIUS,Math.min(p.y,p.y+delta.y)-GRENADE_RADIUS,Math.min(p.z,p.z+delta.z)-GRENADE_RADIUS,Math.max(p.x,p.x+delta.x)+GRENADE_RADIUS,Math.max(p.y,p.y+delta.y)+GRENADE_RADIUS,Math.max(p.z,p.z+delta.z)+GRENADE_RADIUS)) {
      const candidate = sweepBox(p, delta, box);
      if (candidate && (!hit || candidate.time < hit.time)) hit = candidate;
    }
    const fraction = hit?.time ?? 1;
    p.x += delta.x * fraction; p.y += delta.y * fraction; p.z += delta.z * fraction;
    if (!hit) break;
    const n = hit.normal, normalSpeed = v.x * n.x + v.y * n.y + v.z * n.z;
    for (const axis of ['x', 'y', 'z'] as const) {
      p[axis] += n[axis] * .0001;
      v[axis] = (v[axis] - normalSpeed * n[axis]) * .72 - normalSpeed * n[axis] * .42;
    }
    if (n.y > 0 && Math.abs(v.y) < 1) { v.y = 0; if (Math.hypot(v.x, v.z) < .2) v.x = v.z = 0; }
    remaining *= 1 - fraction;
  }
}
