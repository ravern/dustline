import type { Box, Vec3 } from './types.ts';

export type MapId = 'yard' | 'foundry' | 'relay';
export interface MapDefinition {
  id: MapId; name: string; subtitle: string; size: number; boxes: Box[]; spawns: Vec3[];
  teamSpawns: { red: Vec3[]; blue: Vec3[] };
  flagBases: { red: Vec3; blue: Vec3 };
  theme: { sky: number; ground: number; fog: number; sun: number; steel: number; accent: number };
}

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


const v = (x:number,z:number,y=0):Vec3 => ({x,y,z});
const boundary = (size:number):Box[] => {
  const edge=size/2+.6;
  return [
    {x:0,y:1.65,z:-edge,w:size+2.4,h:3.3,d:1.2,kind:'boundary'},
    {x:0,y:1.65,z:edge,w:size+2.4,h:3.3,d:1.2,kind:'boundary'},
    {x:-edge,y:1.65,z:0,w:1.2,h:3.3,d:size,kind:'boundary'},
    {x:edge,y:1.65,z:0,w:1.2,h:3.3,d:size,kind:'boundary'},
  ];
};
// Bases face one another along Z. Eight staggered positions give a full team a
// sheltered exit without spawning inside cover, on a flag, or on another player.
const teamSpawnRows = (z:number, spread=1):Vec3[] =>
  [-1,1].flatMap(row => [-7.5,-2.5,2.5,7.5].map(x=>v(x*spread,z+row*1.6)));

const yard:MapDefinition = {
  id:'yard',name:'Yard',subtitle:'Desert extraction facility',size:MAP_SIZE,boxes:MAP_BOXES,spawns:SPAWNS,
  teamSpawns:{red:teamSpawnRows(-25),blue:teamSpawnRows(25)},
  flagBases:{red:v(0,-23),blue:v(0,23)},
  theme:{sky:0xded5c4,ground:0xd2bc95,fog:.0065,sun:0xffe5bd,steel:0x505c55,accent:0xc0a453},
};

// Foundry: a broad, balanced industrial works. Two covered side routes flank a
// furnace courtyard, with accessible gallery decks and distinct crossing lanes.
const foundryBoxes = boundary(72);
const f = (x:number,y:number,z:number,w:number,h:number,d:number,kind:string,color?:number) => foundryBoxes.push({x,y,z,w,h,d,kind,color});
for(const s of [-1,1]) {
  // Split rear blast walls protect deployment but never seal off a base.
  for(const x of [-10,10]) f(x,1.9,s*25,8,3.8,1.1,'wall',0x727975);
  f(-s*19,1.4,s*22,7.5,2.8,3,'container',s<0?0x8b4737:0x476776);
  f(s*25,1.2,s*13,4.2,2.4,3.2,'generator',0x667277);
  f(s*13,.65,s*17,4.8,1.3,.9,'barrier');
  f(-s*13,.65,s*13,.9,1.3,4.8,'barrier');
  // Furnace cores form soft line-of-sight breaks in the middle lane.
  f(s*6.5,2.8,s*6,5.4,5.6,5.4,'furnace',0x53616a);
  f(s*6.5,.22,s*6,6.2,.44,6.2,'plinth',0x858b82);
  // Galleries sit on columns, preserving a second ground route underneath.
  f(s*21,3.44,0,8,.32,15,'deck');
  for(const x of [s*17.5,s*24.5])for(const z of [-6.7,6.7]) f(x,1.6,z,.34,3.2,.34,'steel');
  f(s*24.9,4.13,0,.14,1.06,15,'rail');
  f(s*17.1,4.13,0,.14,1.06,6,'rail');
  for(const z of [-7.4,7.4]) f(s*22.1,4.13,z,5.7,1.06,.14,'rail');
  f(s*22,4.15,s*3,2.1,1.1,2,'crate',0x8b7754);
  // A 30cm rise on each of twelve steps reaches the 3.6m gallery.
  for(let i=0;i<12;i++) {
    const h=(i+1)*.3;
    f(s*18.8,h/2,s*(15.3-i*.7),2,h,.72,'stairs');
  }
  f(s*30,.65,-s*17,1,1.3,6,'barrier');
  f(-s*27,1.25,s*5,2.3,2.5,3.1,'crate',0x817252);
  // Beam clearance is tall enough to sprint through the service corridor.
  f(s*29,4.8,0,1.8,.55,20,'pipebridge',0x797d6d);
}
f(0,.65,0,4.2,1.3,1.2,'barrier');
f(-3,1,-15,2,2,1.8,'crate',0x666b59);
f(3,1,15,2,2,1.8,'crate',0x666b59);
const foundry:MapDefinition = {
  id:'foundry',name:'Foundry',subtitle:'Ironworks at golden hour',size:72,boxes:foundryBoxes,
  spawns:[v(-31,-30),v(31,30),v(31,-30),v(-31,30),v(-30,0),v(30,0),v(0,-30),v(0,30),v(-13,-20),v(13,20),v(-12,8),v(12,-8)],
  teamSpawns:{red:teamSpawnRows(-31,1.4),blue:teamSpawnRows(31,1.4)},
  flagBases:{red:v(0,-29),blue:v(0,29)},
  theme:{sky:0xaebbc5,ground:0x829099,fog:.007,sun:0xffeed8,steel:0x60747e,accent:0xdf8735},
};

// Relay: a cool highland communications station. The octagonal-looking center
// is assembled from aligned collision solids; the outer ring stays wide open.
const relayBoxes = boundary(76);
const r = (x:number,y:number,z:number,w:number,h:number,d:number,kind:string,color?:number) => relayBoxes.push({x,y,z,w,h,d,kind,color});
for(const s of [-1,1]) {
  // Base buildings are split for two immediate exits and flag approaches.
  for(const x of [-12,12]) r(x,2.2,s*26,10,4.4,5,'station',s<0?0x576b7f:0x996852);
  r(s*25,1.5,s*15,4,3,8,'generator',0x798c91);
  r(-s*23,1.45,s*17,8,2.9,3,'container',0x69818b);
  r(-s*28,.7,s*8,1.1,1.4,6,'barrier');
  r(s*15,.7,s*8,5.4,1.4,1.1,'barrier');
  r(s*9,.7,s*19,4.4,1.4,1.1,'barrier');
  // Raised antenna platforms can be reached from either team's half.
  r(s*23,2.84,0,9,.32,9,'deck');
  for(const x of [s*19,s*27])for(const z of [-4,4])r(x,1.4,z,.32,2.8,.32,'steel');
  r(s*27.4,3.53,0,.14,1.06,9,'rail');
  for(const z of [-4.4,4.4])r(s*24.1,3.53,z,6.1,1.06,.14,'rail');
  r(s*24,3.65,0,2.5,1.3,2.5,'console',0x65777b);
  for(let i=0;i<10;i++) {
    const h=(i+1)*.3;
    r(s*20,h/2,s*(11.5-i*.72),2,h,.74,'stairs');
  }
  r(s*32,1,-s*21,3.2,2,3.5,'crate',0x6f8078);
  r(s*12,1,-s*2,2.6,2,3,'crate',0x6f8078);
}
// Four rounded-looking equipment housings create crossable center quadrants.
for(const x of [-5,5])for(const z of [-5,5]) {
  r(x,1.65,z,4.2,3.3,4.2,'relay',0x8b9694);
  r(x,.15,z,4.6,.3,4.6,'plinth',0x8b9694);
}
r(0,.5,0,2.6,1,2.6,'plinth',0x89958f);
r(0,5.8,0,1.2,8.6,1.2,'mast',0x4e646c);
// The mast is visibly supported by a solid base and has no invisible canopy.
r(0,1.25,0,1.5,2.5,1.5,'console',0x52696d);
const relay:MapDefinition = {
  id:'relay',name:'Relay',subtitle:'Highland communications outpost',size:76,boxes:relayBoxes,
  spawns:[v(-33,-32),v(33,32),v(33,-32),v(-33,32),v(-33,0),v(33,0),v(0,-33),v(0,33),v(-15,-16),v(15,16),v(-12,12),v(12,-12)],
  teamSpawns:{red:teamSpawnRows(-33,1.6),blue:teamSpawnRows(33,1.6)},
  flagBases:{red:v(0,-29),blue:v(0,29)},
  theme:{sky:0xaebfc7,ground:0x87948c,fog:.006,sun:0xe0edff,steel:0x4d666e,accent:0xdfad53},
};

// Small authored barrel clusters sit against the perimeter, away from spawn
// exits. Their collision travels with the map just like larger cover.
for(const map of [yard,foundry,relay])for(const side of [-1,1])for(let i=0;i<3;i++) {
  map.boxes.push({x:side*(map.size/2-2.1),y:.475,z:side*(map.size/2-9)+i*.74,w:.62,h:.95,d:.62,kind:'barrel'});
}

export const MAPS: readonly MapDefinition[] = [yard,foundry,relay];
export function getMap(id:MapId|string = 'yard'):MapDefinition { return MAPS.find(map=>map.id===id) ?? yard; }
