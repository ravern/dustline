import type { Box, Vec3 } from './types';

export const MAP_SIZE = 58;
export const MAP_BOXES: Box[] = [];
const box = (x:number,y:number,z:number,w:number,h:number,d:number,kind:string,color?:number) => MAP_BOXES.push({x,y,z,w,h,d,kind,color});

// The arena is deliberately compact: three intersecting ground routes and two
// accessible rig decks. These same solids drive rendering and server collision.
box(0,1.65,-29.6,60,3.3,1.2,'boundary');
box(0,1.65,29.6,60,3.3,1.2,'boundary');
box(-29.6,1.65,0,1.2,3.3,58,'boundary');
box(29.6,1.65,0,1.2,3.3,58,'boundary');

// Drilling platform: the south staircase leads to the first deck. The west
// staircase runs back along that deck to the second level.
box(0,3.14,0,8.4,.32,8.4,'deck');
box(1,6.44,0,5.8,.32,7.8,'deck');
box(-2.9,6.44,-3.5,2,.32,.8,'deck');
for(const x of [-3.6,3.6]) for(const z of [-3.6,3.6]) box(x,3.15,z,.38,6.3,.38,'steel');
for(let i=0;i<11;i++) {
  const h=(i+1)*.3;
  box(2.8,h/2,10.7-i*.65,1.75,h,.68,'stairs');
  box(-2.8,3.3+h/2,3.4-i*.65,1.5,h,.68,'stairs');
}
// Rail openings line up with the stairs; low collision rails allow intentional jumps.
box(-4.09,3.83,0,.13,1.06,8.4,'rail');
box(4.09,3.83,0,.13,1.06,8.4,'rail');
box(0,3.83,-4.09,8.2,1.06,.13,'rail');
box(-1.3,3.83,4.09,5.55,1.06,.13,'rail');
box(3.82,3.83,4.09,.6,1.06,.13,'rail');
for(const x of [-3.82,3.82]) box(x,7.13,0,.13,1.06,7.7,'rail');
box(0,7.13,3.82,7.7,1.06,.13,'rail');
box(.65,7.13,-3.82,6.35,1.06,.13,'rail');
// Machinery doubles as cover on both levels.
box(.1,4.02,-1.65,2.65,1.44,1.85,'generator',0x626249);
box(1.25,7.14,.65,1.8,1.08,1.4,'crate',0x877648);
box(-1.3,1.2,-.3,2.65,2.4,2.5,'generator',0x777954);

// Shipping yard: broad cover, with room to flank every cluster.
box(-15,1.4,-11.5,8,2.8,2.8,'container',0x9b492e);
box(-18.9,1.4,-5.9,2.8,2.8,8,'container',0x697268);
box(-15,4.2,-11.5,8,2.8,2.8,'container',0x7b8172);
box(16.8,1.4,13.4,8,2.8,2.8,'container',0xb57a3c);
box(18.8,1.4,7.6,2.8,2.8,8,'container',0x665f50);
box(16.8,4.2,13.4,8,2.8,2.8,'container',0x756351);
box(-17.4,1.4,17.8,8,2.8,2.8,'container',0x577273);
box(13.5,1.4,-18.7,8,2.8,2.8,'container',0x746b47);
// West and east tank lanes.
box(-10,1.85,2.5,3.7,3.7,7.3,'tank',0xb8ab83);
box(11.8,1.85,-6.5,3.7,3.7,7.3,'tank',0xb0a280);
box(19.8,1.05,-8.8,3.2,2.1,3.5,'generator',0x697160);
box(-20.8,1.05,8.3,3.2,2.1,3.5,'generator',0x757554);
// Pipe racks and their utility supports are collision solids as well.
for(const s of [-1,1])for(let i=0;i<3;i++)box(s*23.8,1.05+i*.59,s*7.7,.5,.5,9.5,'pipe');
for(const x of [-14,-7])box(x,3.25,8.6,.16,6.5,.16,'steel');
// Low concrete covers punctuate long lines without turning the arena into a maze.
box(-6.4,.62,-16.8,5.2,1.24,.85,'barrier');
box(7.1,.62,17.8,5.2,1.24,.85,'barrier');
box(-7.9,.62,12.4,.85,1.24,4.8,'barrier');
box(9.8,.62,3.8,.85,1.24,4.8,'barrier');
box(-.7,.62,-10.8,4.4,1.24,.85,'barrier');
box(-23.4,.62,-17.6,.85,1.24,4.8,'barrier');
box(23.4,.62,19.2,.85,1.24,4.8,'barrier');
// Pallets and climbing crates.
for(const [x,z,w,h,d] of [[-11.5,-7.7,1.5,1.2,1.5],[-13.1,-7.6,1.5,1.65,1.5],[12.1,10.1,1.6,1.2,1.6],[-18.2,13.9,1.5,1.15,1.5],[9.1,-15.1,1.5,1.15,1.5],[4.5,-21.6,2.1,1.5,1.65],[-2.8,20.8,2.1,1.5,1.65]]) box(x,h/2,z,w,h,d,'crate');

export const SPAWNS:Vec3[] = [
  {x:-24,y:0,z:-23},{x:24,y:0,z:24},{x:-24,y:0,z:24},{x:24,y:0,z:-24},
  {x:0,y:0,z:-24},{x:0,y:0,z:25},{x:-25,y:0,z:0},{x:25,y:0,z:0},
  {x:-11,y:0,z:23},{x:10,y:0,z:-24},
];
