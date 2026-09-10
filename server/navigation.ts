import type { MapDefinition } from '../shared/map.ts';
import type { Vec3 } from '../shared/types.ts';

// A small shared ground graph keeps practice opponents moving around cover.
// It is built once per arena; route searches run only when objectives change.
interface Grid { size: number; origin: number; free: Uint8Array }
const grids = new WeakMap<MapDefinition, Grid>();
const STEP = 2;
function gridFor(map: MapDefinition): Grid {
  const cached = grids.get(map); if (cached) return cached;
  const size = Math.floor((map.size - 2) / STEP) + 1, origin = -(size - 1) * STEP / 2;
  const free = new Uint8Array(size * size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const px = origin + x * STEP, pz = origin + z * STEP;
    free[z * size + x] = map.boxes.some(box => box.y - box.h / 2 < 1.75 && box.y + box.h / 2 > .42 && Math.abs(px - box.x) < box.w / 2 + .45 && Math.abs(pz - box.z) < box.d / 2 + .45) ? 0 : 1;
  }
  const grid = { size, origin, free }; grids.set(map, grid); return grid;
}
export function route(map: MapDefinition, from: Vec3, to: Vec3): Vec3[] {
  const { size, origin, free } = gridFor(map);
  const point = (index: number): Vec3 => ({ x: origin + index % size * STEP, y: 0, z: origin + Math.floor(index / size) * STEP });
  const nearest = (p: Vec3) => {
    let best = -1, score = Infinity;
    for (let index = 0; index < free.length; index++) if (free[index]) {
      const node = point(index), d = (node.x - p.x) ** 2 + (node.z - p.z) ** 2;
      if (d < score) { best = index; score = d; }
    }
    return best;
  };
  const start = nearest(from), goal = nearest(to);
  if (start < 0 || goal < 0) return [];
  const parents = new Int32Array(free.length).fill(-1), queue = new Int32Array(free.length);
  let head = 0, tail = 1; queue[0] = start; parents[start] = start;
  while (head < tail && parents[goal] < 0) {
    const current = queue[head++], x = current % size, z = Math.floor(current / size);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const next = nz * size + nx;
      if (!free[next] || parents[next] >= 0) continue;
      // Adjacent grid points may straddle a thin container wall. Test the
      // swept segment, not just the two endpoints, before accepting an edge.
      const a = point(current), b = point(next);
      const blocked = map.boxes.some(box => box.y - box.h / 2 < 1.75 && box.y + box.h / 2 > .42 && Math.max(a.x, b.x) > box.x - box.w / 2 - .4 && Math.min(a.x, b.x) < box.x + box.w / 2 + .4 && Math.max(a.z, b.z) > box.z - box.d / 2 - .4 && Math.min(a.z, b.z) < box.z + box.d / 2 + .4);
      if (blocked) continue;
      parents[next] = current; queue[tail++] = next;
    }
  }
  if (parents[goal] < 0) return [];
  const path: Vec3[] = [];
  for (let index = goal; index !== start; index = parents[index]) path.push(point(index));
  path.reverse(); path.push({ ...to }); return path;
}
