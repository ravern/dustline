import { containsMapPosition, type MapDefinition } from '../shared/map.ts';
import { collisionIndex, type CollisionIndex } from '../shared/collision.ts';
import type { Vec3 } from '../shared/types.ts';

// A small shared ground graph keeps practice opponents moving around cover.
// It is built once per arena; route searches run only when objectives change.
interface Grid { size: number; origin: number; free: Uint8Array; edges: Uint8Array; collision: CollisionIndex; geometry: string }
const grids = new WeakMap<MapDefinition, Grid>();
const STEP = 2;
function gridFor(map: MapDefinition,collision:CollisionIndex): Grid {
  const geometry=`${map.size}/${map.footprint?.map(r=>`${r.x},${r.z},${r.w},${r.d}`).join('/')}`;
  const cached = grids.get(map); if (cached?.collision===collision&&cached.geometry===geometry) return cached;
  const size = Math.floor((map.size - 2) / STEP) + 1, origin = -(size - 1) * STEP / 2;
  const free = new Uint8Array(size * size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const px = origin + x * STEP, pz = origin + z * STEP;
    free[z * size + x] = !containsMapPosition(map, px, pz, .45) || collision.query(px-.45,.42,pz-.45,px+.45,1.75,pz+.45).some(box => box.y - box.h / 2 < 1.75 && box.y + box.h / 2 > .42 && Math.abs(px - box.x) < box.w / 2 + .45 && Math.abs(pz - box.z) < box.d / 2 + .45) ? 0 : 1;
  }
  const edges=new Uint8Array(free.length);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const current=z*size+x;if(!free[current])continue;
    for(const [dx,dz,forward,backward] of [[1,0,1,2],[0,1,4,8]]){
      const nx=x+dx,nz=z+dz;if(nx>=size||nz>=size||!free[nz*size+nx])continue;
      const ax=origin+x*STEP,az=origin+z*STEP,bx=origin+nx*STEP,bz=origin+nz*STEP;
      const blocked=![.25,.5,.75].every(t=>containsMapPosition(map,ax+(bx-ax)*t,az+(bz-az)*t,.4))||collision.query(ax-.4,.42,az-.4,bx+.4,1.75,bz+.4).some(box=>box.y-box.h/2<1.75&&box.y+box.h/2>.42&&Math.max(ax,bx)>box.x-box.w/2-.4&&Math.min(ax,bx)<box.x+box.w/2+.4&&Math.max(az,bz)>box.z-box.d/2-.4&&Math.min(az,bz)<box.z+box.d/2+.4);
      if(!blocked){edges[current]|=forward;edges[nz*size+nx]|=backward;}
    }
  }
  const grid = { size, origin, free, edges, collision, geometry }; grids.set(map, grid); return grid;
}
export function route(map: MapDefinition, from: Vec3, to: Vec3, collision=collisionIndex(map)): Vec3[] {
  const { size, origin, free, edges } = gridFor(map,collision);
  const point = (index: number): Vec3 => ({ x: origin + index % size * STEP, y: 0, z: origin + Math.floor(index / size) * STEP });
  const nearest = (p: Vec3) => {
    let best = -1, score = Infinity;
    for (let index = 0; index < free.length; index++) if (free[index]) {
      const d = (origin + index % size * STEP - p.x) ** 2 + (origin + Math.floor(index / size) * STEP - p.z) ** 2;
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
    for (const [dx, dz, bit] of [[1, 0, 1], [-1, 0, 2], [0, 1, 4], [0, -1, 8]]) {
      if(!(edges[current]&bit))continue;
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const next = nz * size + nx;
      if (!free[next] || parents[next] >= 0) continue;
      parents[next] = current; queue[tail++] = next;
    }
  }
  if (parents[goal] < 0) return [];
  const path: Vec3[] = [];
  for (let index = goal; index !== start; index = parents[index]) path.push(point(index));
  path.reverse();
  if (containsMapPosition(map, to.x, to.z, .35)) path.push({ ...to });
  return path;
}
