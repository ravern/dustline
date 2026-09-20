import type { MapDefinition } from './map.ts';
import type { Box, Vec3 } from './types.ts';
const CELL = 8;
const indexes = new WeakMap<Box[], CollisionIndex>();
/** Static X/Z broadphase. Results retain map order for deterministic contacts. */
export class CollisionIndex {
  readonly boxes: Box[];
  private readonly bounds: Float64Array;
  private readonly cells: number[][];
  private readonly columnBoxes: Box[][];
  private readonly seen: Uint32Array;
  private stamp = 0;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly width: number;
  private readonly depth: number;
  constructor(boxes: Box[]) {
    this.boxes = boxes.slice(); this.bounds = new Float64Array(boxes.length * 6); this.seen = new Uint32Array(boxes.length);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]; this.bounds.set([b.x, b.y, b.z, b.w, b.h, b.d], i * 6);
      x0 = Math.min(x0, Math.floor((b.x - b.w / 2) / CELL)); x1 = Math.max(x1, Math.floor((b.x + b.w / 2) / CELL));
      z0 = Math.min(z0, Math.floor((b.z - b.d / 2) / CELL)); z1 = Math.max(z1, Math.floor((b.z + b.d / 2) / CELL));
    }
    this.minX = boxes.length ? x0 : 0; this.minZ = boxes.length ? z0 : 0;
    this.width = boxes.length ? x1 - x0 + 1 : 0; this.depth = boxes.length ? z1 - z0 + 1 : 0;
    this.cells = Array.from({ length: this.width * this.depth }, () => []);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      for (let z = Math.floor((b.z - b.d / 2) / CELL); z <= Math.floor((b.z + b.d / 2) / CELL); z++)
        for (let x = Math.floor((b.x - b.w / 2) / CELL); x <= Math.floor((b.x + b.w / 2) / CELL); x++) this.cells[(z - this.minZ) * this.width + x - this.minX].push(i);
    }
    this.columnBoxes=this.cells.map(cell=>cell.map(i=>this.boxes[i]));
  }
  /** Allocation-free candidate list for the usual single-cell player footprint. */
  columns(x0:number,z0:number,x1:number,z1:number):readonly Box[]{
    const x=Math.floor(x0/CELL)-this.minX,z=Math.floor(z0/CELL)-this.minZ;
    if(x===Math.floor(x1/CELL)-this.minX&&z===Math.floor(z1/CELL)-this.minZ){
      if(x<0||x>=this.width||z<0||z>=this.depth)return [];
      return this.columnBoxes[z*this.width+x];
    }
    return this.query(x0,-Infinity,z0,x1,Infinity,z1);
  }
  matches(boxes: Box[]): boolean {
    if (boxes.length !== this.boxes.length) return false;
    // One validation per batch also detects deep edits through external refs.
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i], n = i * 6;
      if (b !== this.boxes[i] || b.x !== this.bounds[n] || b.y !== this.bounds[n + 1] || b.z !== this.bounds[n + 2] || b.w !== this.bounds[n + 3] || b.h !== this.bounds[n + 4] || b.d !== this.bounds[n + 5]) return false;
    }
    return true;
  }
  private nextStamp() { if (++this.stamp === 0xffffffff) { this.seen.fill(0); this.stamp = 1; } return this.stamp; }
  query(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box[] {
    const left = Math.max(0, Math.floor(x0 / CELL) - this.minX), right = Math.min(this.width - 1, Math.floor(x1 / CELL) - this.minX);
    const front = Math.max(0, Math.floor(z0 / CELL) - this.minZ), back = Math.min(this.depth - 1, Math.floor(z1 / CELL) - this.minZ);
    const stamp = this.nextStamp(), found: number[] = [];
    for (let z = front; z <= back; z++) for (let x = left; x <= right; x++) for (const i of this.cells[z * this.width + x]) {
      if (this.seen[i] === stamp) continue; this.seen[i] = stamp;
      const b = this.boxes[i];
      if (b.x + b.w / 2 >= x0 && b.x - b.w / 2 <= x1 && b.z + b.d / 2 >= z0 && b.z - b.d / 2 <= z1 && b.y + b.h / 2 >= y0 && b.y - b.h / 2 <= y1) found.push(i);
    }
    found.sort((a, b) => a - b); return found.map(i => this.boxes[i]);
  }
  ray(origin: Vec3, direction: Vec3, distance: number): Box[] {
    if (!this.cells.length || distance < 0) return [];
    let enter = 0, exit = distance;
    for (const [axis, low, high] of [['x', this.minX * CELL, (this.minX + this.width) * CELL], ['z', this.minZ * CELL, (this.minZ + this.depth) * CELL]] as const) {
      const d = direction[axis], p = origin[axis];
      if (Math.abs(d) < 1e-12) { if (p < low || p > high) return []; }
      else { const a = (low - p) / d, b = (high - p) / d; enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b)); }
    }
    if (enter > exit) return [];
    let x = Math.max(0, Math.min(this.width - 1, Math.floor((origin.x + direction.x * enter) / CELL) - this.minX));
    let z = Math.max(0, Math.min(this.depth - 1, Math.floor((origin.z + direction.z * enter) / CELL) - this.minZ));
    const sx = Math.sign(direction.x), sz = Math.sign(direction.z), dx = Math.abs(CELL / direction.x), dz = Math.abs(CELL / direction.z);
    let tx = sx ? ((this.minX + x + (sx > 0 ? 1 : 0)) * CELL - origin.x) / direction.x : Infinity;
    let tz = sz ? ((this.minZ + z + (sz > 0 ? 1 : 0)) * CELL - origin.z) / direction.z : Infinity;
    const stamp = this.nextStamp(), found: number[] = [];
    while (x >= 0 && x < this.width && z >= 0 && z < this.depth) {
      for (const i of this.cells[z * this.width + x]) if (this.seen[i] !== stamp) { this.seen[i] = stamp; found.push(i); }
      const next = Math.min(tx, tz); if (next > exit || !Number.isFinite(next)) break;
      if (tx <= next) { x += sx; tx += dx; }
      if (tz <= next) { z += sz; tz += dz; }
    }
    found.sort((a, b) => a - b); return found.map(i => this.boxes[i]);
  }
}
/** Fresh index for a synchronous batch; reacquire after mutating map geometry. */
export function collisionIndex(map: Pick<MapDefinition, 'boxes'>): CollisionIndex {
  const cached = indexes.get(map.boxes); if (cached?.matches(map.boxes)) return cached;
  const index = new CollisionIndex(map.boxes); indexes.set(map.boxes, index); return index;
}
