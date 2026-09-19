import type { Box } from './types.ts';

interface Opening { low: number; high: number; bottom: number; top: number }
const door = (low: number, high: number, bottom = 0): Opening => ({ low, high, bottom, top: bottom + 2.45 });
const window = (low: number, high: number, bottom: number): Opening => ({ low, high, bottom, top: bottom + 1.55 });

/** Two opposing houses share a measured plan, including real holes in each wall.
 * Canonical house coordinates are relative to (8,23); the other is rotated 180°.
 * Floors are at 0 and 3.2m, indoor stairs run +Z, rear stairs run -Z.
 */
export function createHomesteadGeometry(): Box[] {
  const geometry: Box[] = [];
  for (const side of [-1, 1]) {
    const add = (x: number, y: number, z: number, w: number, h: number, d: number, kind: string, color = side > 0 ? 0xd1c5ac : 0xaebabe) => {
      if (w > .001 && h > .001 && d > .001) geometry.push({ x: side * (8 + x), y, z: side * (23 + z), w, h, d, kind, color });
    };
    // Split a facade around its openings, merging adjacent solid strips.
    const facade = (axis: 'x' | 'z', fixed: number, low: number, high: number, bottom: number, top: number, openings: Opening[], kind = 'house-wall') => {
      const cuts = [...new Set([low, high, ...openings.flatMap(o => [Math.max(low, o.low), Math.min(high, o.high)])])].sort((a, b) => a - b);
      const pieces: { low: number; high: number; bottom: number; top: number; kind: string }[] = [];
      for (let i = 0; i < cuts.length - 1; i++) {
        const left = cuts[i], right = cuts[i + 1], center = (left + right) / 2;
        const gaps = openings.filter(o => center > o.low && center < o.high).sort((a, b) => a.bottom - b.bottom);
        let y = bottom;
        const solid = (end: number) => {
          if (end <= y + .001) return;
          const part = kind === 'garage-wall' ? kind : end - y < 1.5 ? (y === bottom ? 'house-sill' : 'house-header') : kind;
          const previous = pieces.find(p => p.high === left && p.bottom === y && p.top === end && p.kind === part);
          if (previous) previous.high = right;
          else pieces.push({ low: left, high: right, bottom: y, top: end, kind: part });
        };
        for (const opening of gaps) { solid(Math.min(top, opening.bottom)); y = Math.max(y, opening.top); }
        solid(top);
      }
      for (const p of pieces) {
        const center = (p.low + p.high) / 2, length = p.high - p.low;
        add(axis === 'x' ? center : fixed, (p.bottom + p.top) / 2, axis === 'x' ? fixed : center, axis === 'x' ? length : .24, p.top - p.bottom, axis === 'x' ? .24 : length, p.kind);
      }
    };

    facade('x', -6, -7, 7, 0, 6.4, [
      door(-1.1, 1.1), window(-5.8, -3.0, .95), window(2.5, 5.6, .95),
      window(-5.8, -3.0, 4.1), window(-1.15, 1.15, 4.1), window(3.2, 5.7, 4.1),
    ]);
    facade('x', 6, -7, 7, 0, 6.4, [
      door(-4.8, -2.6), window(.8, 3.1, 1.0),
      door(-1.15, 1.15, 3.2), window(-5.8, -3.0, 4.1), window(3.3, 5.8, 4.1),
    ]);
    facade('z', -7, -6, 6, 0, 6.4, [
      door(.5, 2.7), window(-4.8, -2.3, .95), window(3.5, 5.5, .95),
      window(-4.8, -2.3, 4.1), window(.3, 2.8, 4.1), window(3.5, 5.5, 4.1),
    ]);
    facade('z', 7, -6, 6, 0, 6.4, [
      window(-4.8, -2.3, .95), window(1, 4.4, .95),
      window(-4.8, -2.3, 4.1), window(1, 4.4, 4.1),
    ]);

    // The floor is four slabs around an open stairwell, never a solid ceiling
    // across the staircase. The rear slab is the upper landing.
    add(-1.6, 3.1, 0, 10.4, .2, 11.6, 'house-floor', 0x8e8371); // x[-6.8,3.6]
    add(6.3, 3.1, 0, 1, .2, 11.6, 'house-floor', 0x8e8371);
    add(4.7, 3.1, -5.35, 2.2, .2, .9, 'house-floor', 0x8e8371);
    add(4.7, 3.1, 4.2, 2.2, .2, 3.2, 'house-floor', 0x8e8371);
    add(0, 6.5, 0, 14.6, .2, 12.6, 'house-roof', 0x565c59);

    // Living room opens through a broad doorway into the kitchen/back exit.
    facade('x', 1.3, -6.8, 3.6, 0, 3.0, [door(-1.2, 1.2)]);
    // Upstairs, a corridor connects the stair landing, bedrooms and balcony.
    facade('z', -1.8, -5.8, 5.8, 3.2, 6.4, [door(.2, 2.5, 3.2)]);
    facade('x', -1.3, -6.8, -1.8, 3.2, 6.4, [door(-4.6, -2.7, 3.2)]);

    for (let step = 0; step < 16; step++) {
      const height = (step + 1) * .2;
      add(4.7, height / 2, -4.5 + step * .45, 1.7, height, .46, 'stairs', 0x9b907d);
    }
    // Upper guardrails keep the open stairwell visible and safe. Its rear is
    // intentionally open so the final tread joins the landing.
    add(3.62, 3.75, -1.15, .10, 1.1, 7.2, 'rail', 0x676d66);
    add(5.78, 3.75, -1.15, .10, 1.1, 7.2, 'rail', 0x676d66);
    add(4.7, 3.75, -4.87, 2.26, 1.1, .10, 'rail', 0x676d66);

    // Rear balcony and a second staircase form a full flanking loop.
    add(0, 3.1, 7, 13.6, .2, 2.4, 'house-floor', 0x8b8875);
    add(-1.15, 3.75, 8.2, 11.3, 1.1, .10, 'rail', 0x676d66);
    for (const x of [-6.8, 6.8]) add(x, 3.75, 7, .10, 1.1, 2.4, 'rail', 0x676d66);
    for (let step = 0; step < 16; step++) {
      const height = (step + 1) * .2;
      add(5.5, height / 2, 15.25 - step * .45, 1.7, height, .46, 'stairs', 0x9a9b8b);
    }

    // Furniture is shared cover, arranged beside the circulation routes.
    add(-4.5, .45, -3.3, 3.2, .9, 1.2, 'house-sofa', 0x6c817a);
    add(1.5, .5, 4.9, 2.5, 1, .8, 'house-counter', 0xa9977c);
    for (const z of [-3.2, 3.7]) add(-5.6, 3.48, z, 1.6, .56, 2.1, 'house-bed', 0xb0a48b);
    add(-10.9, .45, 1.1, .6, .9, 2, 'house-counter', 0xa9977c);

    // Attached garage: a wide street entrance, a backyard exit and an actual
    // interior doorway through the home's west wall give three useful routes.
    facade('x', -3.2, -11.5, -7, 0, 2.8, [door(-10.8, -7.7)], 'garage-wall');
    facade('x', 4.3, -11.5, -7, 0, 2.8, [door(-10.6, -8.3)], 'garage-wall');
    facade('z', -11.5, -3.2, 4.3, 0, 2.8, [window(-1.7, .5, .95)], 'garage-wall');
    add(-9.25, 2.9, .55, 4.5, .2, 7.74, 'house-roof', 0x747b75);
  }

  const add = (x: number, y: number, z: number, w: number, h: number, d: number, kind: string, color: number) => geometry.push({ x, y, z, w, h, d, kind, color });
  // The central bus is hollow, with front and rear side doors on the east.
  add(-4, .16, -2, 3.5, .32, 10, 'vehicle-floor', 0x686d65);
  add(-4, 2.51, -2, 3.5, .18, 10, 'vehicle-roof', 0xc3a252);
  add(-5.66, 1.05, -2, .18, 1.46, 10, 'vehicle-wall', 0xc3a252);
  add(-2.34, 1.05, -2, .18, 1.46, 5.2, 'vehicle-wall', 0xc3a252);
  for (const z of [-6.9, 2.9]) add(-4, 1.35, z, 3.5, 2.06, .2, 'vehicle-wall', 0x72786c);
  // Rear-open delivery truck: .4m cargo deck, sidewalls and roof, no solid box.
  add(7, .2, 3, 3, .4, 6, 'vehicle-floor', 0x666f67);
  add(7, 2.8, 3, 3, .2, 6, 'vehicle-roof', 0xa8aea0);
  for (const x of [5.58, 8.42]) add(x, 1.55, 3, .16, 2.3, 6, 'vehicle-wall', 0xa8aea0);
  add(7, 1.35, .15, 2.84, 1.9, .3, 'vehicle-wall', 0x66776a);
  return geometry;
}
