import type { Box, Vec3 } from './types.ts';
import { createHomesteadGeometry } from './homestead.ts';

export type MapId = 'yard' | 'foundry' | 'relay' | 'bazaar' | 'harbor' | 'citadel' | 'junction' | 'oasis' | 'overpass' | 'canal' | 'crossfire' | 'hangar' | 'quarry' | 'outpost' | 'gardens' | 'vault' | 'terminal' | 'switchback' | 'airfield' | 'homestead' | 'derrick';
export interface MapRegion { x: number; z: number; w: number; d: number }
export interface MapDefinition {
  id: MapId; name: string; subtitle: string; size: number; boxes: Box[]; spawns: Vec3[];
  teamSpawns: { red: Vec3[]; blue: Vec3[] };
  flagBases: { red: Vec3; blue: Vec3 };
  footprint?: MapRegion[];
  outline?: {x:number;z:number}[];
  architecture?: 'airport' | 'suburb' | 'rig';
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
// Bases face one another along Z. Sixteen staggered positions give a full team a
// sheltered exit without spawning inside cover, on a flag, or on another player.
const teamSpawnRows = (z:number, spread=1):Vec3[] =>
  [-1,1].flatMap(row => [-8.75,-6.25,-3.75,-1.25,1.25,3.75,6.25,8.75].map(x=>v(x*spread,z+row*1.6)));

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

// Original arena layouts: short crossings, side routes, and clear landmarks.
// Coordinates describe real solids; the renderer and server share every route.
const solid = (x:number,z:number,w:number,d:number,h:number,kind='wall',color=0x9c998a):Box => ({x,y:h/2,z,w,h,d,kind,color});
function arena(id:MapId,name:string,subtitle:string,size:number,theme:MapDefinition['theme'],boxes:Box[]):MapDefinition {
  const teamSpawns={red:teamSpawnRows(-size/2+4,1.4),blue:teamSpawnRows(size/2-4,1.4)};
  return {id,name,subtitle,size,theme,boxes:[...boundary(size),...boxes],teamSpawns,
    spawns:[...teamSpawns.red,...teamSpawns.blue,v(-size/2+4,0),v(size/2-4,0)],
    flagBases:{red:v(0,-size/2+7),blue:v(0,size/2-7)}};
}
const bazaar=arena('bazaar','Bazaar','Market alleys and a split courtyard',76,
  {sky:0xe0c8a6,ground:0xcbb48a,fog:.0045,sun:0xffe2b5,steel:0x756654,accent:0xc98252},[
    // Alternating blocks make a zigzag main street, with two open outer alleys.
    ...[-1,1].flatMap(s=>[
      solid(s*13,s*21,13,8,5,'wall',0xc69975),solid(-s*19,s*14,10,16,5,'wall',0xd3be91),
      solid(s*11,s*2,9,8,4,'wall',0xc6ac83),solid(-s*27,s*24,4,3,2,'crate'),
      solid(s*24,-s*4,3,6,1.3,'barrier'),solid(s*3,s*15,3,2,1.3,'crate'),
    ]),solid(0,0,3,3,1.1,'plinth',0xd3be91),
  ]);
const harbor=arena('harbor','Harbor','Cargo lanes around a loading dock',84,
  {sky:0xb7ced4,ground:0x899b9c,fog:.0045,sun:0xe6f4ff,steel:0x4c6770,accent:0xd4ac55},[
    ...[-1,1].flatMap(s=>[
      solid(s*20,s*24,14,3,2.8,'container',0x426d7e),solid(-s*22,s*15,3,16,2.8,'container',0x9f593f),
      solid(s*11,s*9,3,14,2.8,'container',0x578079),solid(s*27,-s*6,11,3,2.8,'container',0xb39b58),
      solid(s*4,s*25,4,2,1.3,'barrier'),solid(-s*30,s*27,2,2,1.5,'crate'),
      solid(s*28,s*10,3,3,2,'generator'),
    ]),solid(0,0,6,8,2.8,'container',0x6b8790),
  ]);
const citadel=arena('citadel','Citadel','Stone court with two raised galleries',80,
  {sky:0xd0cbd1,ground:0xa49d90,fog:.004,sun:0xffdbb9,steel:0x625d63,accent:0xc8aa65},[
    ...[-1,1].flatMap(s=>[
      solid(s*12,s*24,14,3,5,'wall',0x9b9085),solid(s*8,s*9,3,10,4,'wall',0xb0a18b),
      solid(-s*28,s*18,5,5,5,'wall',0x8c8483),solid(s*2,s*17,2,2,1.5,'crate'),
      {x:s*21,y:3.44,z:0,w:8,h:.32,d:16,kind:'deck'},
      ...[-1,1].map(z=>solid(s*24,z*6,1,1,3.3,'wall',0x9b9085)),
      ...Array.from({length:12},(_,i)=>solid(s*18.8,s*(15.3-i*.7),2,.72,(i+1)*.3,'stairs')),
      {x:s*24.9,y:4.13,z:0,w:.14,h:1.06,d:16,kind:'rail'},
    ]),solid(0,0,4,4,2,'plinth',0xa89c8d),
  ]);
const junction=arena('junction','Junction','Rail depot with open cross routes',88,
  {sky:0xc2cad5,ground:0x828c8c,fog:.004,sun:0xffd9af,steel:0x50636c,accent:0xe0b357},[
    // Long cars divide three lanes; gaps between the cars permit crossing.
    ...[-1,1].flatMap(s=>[
      solid(s*12,s*19,3.5,19,3.2,'container',0x84724f),solid(s*12,-s*10,3.5,13,3.2,'container',0x596f75),
      solid(s*30,s*18,7,10,4,'wall',0x9ba6a6),solid(s*27,-s*9,5,3,2.3,'generator'),
      solid(s*5,s*27,4,1,1.3,'barrier'),solid(s*24,s*1,3,3,1.5,'crate'),
    ]),solid(0,0,5,4,2.4,'generator',0x738077),
  ]);
const oasis=arena('oasis','Oasis','Desert ruins with a sheltered center',80,
  {sky:0xd8c6a9,ground:0xd4bc8d,fog:.004,sun:0xffe6b8,steel:0x82765a,accent:0x69a49a},[
    // Four broken walls shelter the middle while the diagonal gaps stay open.
    solid(0,-7,9,1.5,4,'wall',0xc6ad7f),solid(0,7,9,1.5,4,'wall',0xc6ad7f),
    solid(-7,0,1.5,9,4,'wall',0xd8c699),solid(7,0,1.5,9,4,'wall',0xd8c699),
    ...[-1,1].flatMap(s=>[
      solid(s*19,s*20,12,3,3,'wall',0xcab587),solid(-s*22,s*15,3,10,3,'wall',0xd8c699),
      solid(s*24,-s*5,4,4,4.5,'wall',0xc6ad7f),solid(s*11,s*20,2,2,1.2,'crate'),
      solid(s*3,s*25,4,1,1.3,'barrier'),
    ]),solid(0,0,3,3,.7,'plinth',0x65928a),
  ]);
const overpass=arena('overpass','Overpass','Bridge crossing above covered ground routes',84,
  {sky:0xb9c9d0,ground:0x8f9c9d,fog:.004,sun:0xe9efff,steel:0x596b74,accent:0xe0aa50},[
    {x:0,y:3.44,z:0,w:42,h:.32,d:12,kind:'deck'},
    ...[-1,1].flatMap(s=>[
      ...[-1,1].map(z=>solid(s*19,z*4,1.2,1.2,3.3,'wall',0x879397)),
      ...Array.from({length:12},(_,i)=>solid(s*16,s*(14.3-i*.8),3,.82,(i+1)*.3,'stairs')),
      solid(-s*22,s*22,12,4,3,'container',0x617c83),solid(s*27,s*17,4,7,3,'wall',0xa7acaa),
      solid(s*5,s*22,5,1,1.3,'barrier'),solid(-s*8,s*13,3,3,2,'crate'),
      {x:s*5,y:4.2,z:s*2,w:4,h:1.2,d:1,kind:'barrier'},
      {x:0,y:4.13,z:s*5.9,w:25,h:1.06,d:.14,kind:'rail'},
    ]),
  ]);

const canal=arena('canal','Canal','Parallel banks with three crossing points',84,
  {sky:0xb4ced0,ground:0x94a6a0,fog:.004,sun:0xe7f6ef,steel:0x526e70,accent:0x85b3a9},[
    // Raised banks split the center; three gaps connect the ground lanes.
    ...[-1,1].flatMap(s=>[
      solid(s*6,-18,2,16,2.5,'wall',0xa7b7ad),solid(s*6,18,2,16,2.5,'wall',0xa7b7ad),
      solid(s*23,s*21,10,5,4,'wall',0x9bafa8),solid(s*24,-s*6,7,7,3,'wall',0xc1b798),
      solid(s*16,-s*21,3,3,1.5,'crate'),solid(s*27,s*9,1,5,1.3,'barrier'),
    ]),solid(0,0,3,3,1,'plinth',0x6d9794),
  ]);
const crossfire=arena('crossfire','Crossfire','Offset streets around a central block',80,
  {sky:0xcac1b5,ground:0xaca190,fog:.004,sun:0xffdeb9,steel:0x736c64,accent:0xc08d5e},[
    solid(0,0,12,14,6,'wall',0xc6b69b),
    ...[-1,1].flatMap(s=>[
      solid(s*22,s*16,8,14,5,'wall',0x9b8b7c),solid(-s*16,s*25,12,3,4,'wall',0xbba48b),
      solid(s*18,-s*8,8,3,4,'wall',0xc2ac91),solid(s*10,s*20,2,3,1.5,'crate'),
      solid(s*29,-s*19,3,4,2,'generator'),solid(s*3,s*23,3,1,1.3,'barrier'),
    ]),
  ]);
const hangar=arena('hangar','Hangar','Twin covered halls with a service yard',88,
  {sky:0xbcc9d2,ground:0x929ea3,fog:.004,sun:0xe8f0ff,steel:0x536c7d,accent:0xd6a659},[
    ...[-1,1].flatMap(s=>[
      // Open ends and side doors keep each roofed hall accessible.
      {x:s*21,y:5.8,z:0,w:18,h:.4,d:32,kind:'deck'},
      ...[-1,1].flatMap(z=>[
        solid(s*29,z*11,1,10,5.6,'wall',0x8296a2),solid(s*13,z*11,1,10,5.6,'wall',0x8296a2),
      ]),
      solid(s*21,s*6,8,3,2.8,'container',0x637e8e),solid(s*21,-s*7,3,4,2,'generator'),
      solid(s*8,s*26,9,2,1.3,'barrier'),solid(-s*30,s*27,3,3,1.5,'crate'),
    ]),solid(0,0,3,8,2.4,'generator',0x8c988b),
  ]);
const quarry=arena('quarry','Quarry','Stone terraces with narrow cut-throughs',88,
  {sky:0xd5cbbb,ground:0xbfb09a,fog:.004,sun:0xffe4c2,steel:0x756f60,accent:0xd6ad57},[
    ...[-1,1].flatMap(s=>[
      solid(s*20,s*18,15,9,5,'wall',0xa99d86),solid(-s*25,s*6,7,12,4,'wall',0xb9aa8c),
      solid(s*8,s*6,7,6,3,'wall',0xc5b494),solid(s*30,-s*23,3,3,1.8,'crate'),
      solid(s*4,s*27,5,2,1.3,'barrier'),
      // Four broad low ledges give a route onto the side shelf.
      ...Array.from({length:4},(_,i)=>solid(s*19,-s*(21-i*1.2),5,1.3,(i+1)*.3,'stairs')),
      solid(s*19,-s*14,5,7,1.2,'plinth',0x9d927e),
    ]),solid(0,0,2,2,2,'wall',0xb9aa8c),
  ]);
const outpost=arena('outpost','Outpost','Four compounds around an open crossroads',84,
  {sky:0xb8c8b9,ground:0x9da58a,fog:.004,sun:0xffebc8,steel:0x606f5a,accent:0xc2af5d},[
    ...[-1,1].flatMap(x=>[-1,1].flatMap(z=>[
      solid(x*19,z*17,9,10,4,'wall',0x85917b),
      solid(x*8,z*19,3,1,1.3,'barrier'),solid(x*23,z*6,1,5,1.3,'barrier'),
      solid(x*29,z*24,3,3,1.5,'crate'),
    ])),solid(0,0,4,4,2.4,'generator',0x74836f),
  ]);
const gardens=arena('gardens','Gardens','Walled gardens around a pavilion',80,
  {sky:0xc6d7c6,ground:0x91a58a,fog:.004,sun:0xffefce,steel:0x687a65,accent:0xc8b77b},[
    {x:0,y:4.2,z:0,w:12,h:.4,d:12,kind:'deck'},
    ...[-1,1].flatMap(x=>[-1,1].map(z=>solid(x*5,z*5,1,1,4,'wall',0xc6c3aa))),
    ...[-1,1].flatMap(s=>[
      solid(s*18,s*19,13,2,2.3,'wall',0x70896c),solid(-s*24,s*11,2,14,2.3,'wall',0x70896c),
      solid(s*16,s*5,2,8,2.3,'wall',0x829478),solid(s*4,s*22,3,3,.8,'plinth',0xb4b29c),
      solid(s*27,-s*20,3,3,1,'plinth',0xb4b29c),
    ]),solid(0,0,3,3,1,'plinth',0xb4b29c),
  ]);
const vault=arena('vault','Vault','Covered bunker with an open outer route',80,
  {sky:0xc3ccd6,ground:0x889398,fog:.004,sun:0xf0e8db,steel:0x5c6a75,accent:0xd5a85e},[
    {x:0,y:5.6,z:0,w:46,h:.4,d:46,kind:'deck'},
    ...[-1,1].flatMap(s=>[
      ...[-1,1].map(x=>solid(x*15,s*22,13,1,5.4,'wall',0x919c9e)),
      ...[-1,1].map(z=>solid(s*22,z*15,1,13,5.4,'wall',0x919c9e)),
      solid(s*10,s*4,1.5,14,4,'wall',0x76838c),solid(-s*7,s*13,8,1.5,4,'wall',0x76838c),
      solid(s*16,-s*9,3,3,2,'generator'),solid(s*3,s*27,4,1,1.3,'barrier'),
    ]),solid(0,0,3,3,1.5,'crate'),
  ]);
const terminal=arena('terminal','Terminal','Loading bays on a covered concourse',88,
  {sky:0xc4d0d4,ground:0xa0a9a7,fog:.004,sun:0xffe9c8,steel:0x60737a,accent:0xccab63},[
    {x:0,y:5.2,z:0,w:12,h:.4,d:50,kind:'deck'},
    ...[-1,1].flatMap(s=>[
      ...[-1,1].map(z=>solid(s*5,z*21,1,1,5,'wall',0xb9c0b7)),
      solid(s*19,s*19,12,5,4,'wall',0xaeb9b2),solid(s*22,-s*7,5,12,3,'container',0x547d8c),
      solid(s*29,-s*23,6,3,2,'generator'),solid(s*12,s*5,3,3,1.4,'crate'),
      solid(s*2,s*11,2,4,1.2,'barrier'),
    ]),solid(0,0,3,3,2,'console',0x67858b),
  ]);
const switchback=arena('switchback','Switchback','Staggered walls with fast diagonal routes',80,
  {sky:0xc6c1b7,ground:0xaca68f,fog:.004,sun:0xffe3b9,steel:0x716e5e,accent:0xc59c58},[
    ...[-1,1].flatMap(s=>[
      solid(s*6,s*19,20,2,4,'wall',0xa89e87),solid(-s*6,s*8,20,2,3.4,'wall',0xb9ad91),
      solid(s*26,s*4,3,14,3,'wall',0x958d7c),solid(-s*26,s*23,4,4,2,'crate'),
      solid(s*3,s*27,3,1,1.3,'barrier'),
    ]),solid(0,0,2,2,1.3,'crate'),
  ]);

// A footprint is a union of ground rectangles, independent of the minimap's
// enclosing square. The same outline drives visible walls, collision and bots.
export function sceneryInnerRadius(map:MapDefinition):number { return Math.max(62,Math.SQRT1_2*map.size+12); }
export function containsMapPosition(map:MapDefinition,x:number,z:number,padding=0):boolean {
  if(!map.footprint)return Math.abs(x)<=map.size/2-padding&&Math.abs(z)<=map.size/2-padding;
  const inside=(px:number,pz:number)=>map.footprint!.some(r=>Math.abs(px-r.x)<=r.w/2+1e-7&&Math.abs(pz-r.z)<=r.d/2+1e-7);
  return inside(x,z)&&[-1,1].every(sx=>[-1,1].every(sz=>inside(x+sx*padding,z+sz*padding)));
}
function shapedArena(id:MapId,name:string,subtitle:string,size:number,architecture:NonNullable<MapDefinition['architecture']>,footprint:MapRegion[],outline:number[][],red:Vec3,blue:Vec3,theme:MapDefinition['theme']):MapDefinition {
  const points=outline.map(([x,z])=>({x,z}));
  const boxes:Box[]=points.map((a,i)=>{
    const b=points[(i+1)%points.length],horizontal=a.z===b.z;
    return {x:(a.x+b.x)/2,y:2.5,z:(a.z+b.z)/2,w:horizontal?Math.abs(a.x-b.x)+.6:.6,h:5,d:horizontal?.6:Math.abs(a.z-b.z)+.6,kind:'perimeter'};
  });
  return {id,name,subtitle,size,architecture,footprint,outline:points,boxes,spawns:[],teamSpawns:{red:[],blue:[]},flagBases:{red,blue},theme};
}
const airfield=shapedArena('airfield','Airfield','Connected terminal lounges, a live aircraft cabin, and exposed apron',100,'airport',[
  {x:-18,z:-6,w:40,d:80},{x:21,z:19,w:38,d:30},
],[[-38,-46],[2,-46],[2,4],[40,4],[40,34],[-38,34]],v(-18,-38),v(30,22),
 {sky:0xc0d4de,ground:0x9aa7a8,fog:.0038,sun:0xe8f2ff,steel:0x526d7e,accent:0xe4b953});
const a=(x:number,z:number,w:number,d:number,h:number,kind='terminal-wall',color=0xb9c7cc,y=h/2)=>airfield.boxes.push({x,y,z,w,h,d,kind,color});
// Shop interiors connect the concourse to a narrow rear shortcut. Their
// storefronts and back doors are genuine gaps in shared collision geometry.
for(const z of [-26,-5,16]) {
 for(const end of [-1,1])a(-32,z+end*5.5,8,.3,3.6,'shop-wall',0xaebac3);
 for(const end of [-1,1])a(-36,z+end*3.7,.3,3.6,3.6,'shop-wall',0xaebac3);
 a(-32,z,8.2,11.2,.25,'shop-roof',0xc0c6bd,3.725);
 a(-33,z+2,4,.7,1.15,'counter',0xb5c4c6);
 a(-4,z,6,5,1.25,'counter',0x547380);
}
// A raised dining lounge has an interior stair and open balconies facing the
// lower concourse. The lower cafe stays passable under the lounge floor.
a(-18,-8,13,13,.3,'deck',0xa6b4b9,3.05);
for(const x of [-23.7,-12.3])for(const z of [-13.7,-2.3])a(x,z,.32,.32,2.9,'column',0xaebdc3);
for(let i=0;i<10;i++)a(-24.4,-22.2+i*.78,2,.8,(i+1)*.32,'stairs',0x69828a);
a(-22.9,-14.4,4.2,1.8,.3,'deck',0xa6b4b9,3.05);
a(-11.55,-8,.12,13,1.05,'rail',0xd5b264,3.725);
a(-18,-1.55,13,.12,1.05,'rail',0xd5b264,3.725);
for(const x of [-21,-16])a(x,-7,2,1.2,1.05,'counter',0x7f999d);
a(-20,-11,4,1,1.05,'bench',0x547887,3.725);
a(-15,-4,4,1,1.05,'bench',0x547887,3.725);
a(-23,-25,7,1,1.15,'counter',0xb5c4c6);a(-11,-21,7,1,1.15,'counter',0xb5c4c6);
a(-22,9,6,1,1.1,'bench',0x547887);a(-10,17,6,1,1.1,'bench',0x547887);
a(-18,-26,23,25,.35,'terminal-roof',0xb4c3c7,7.2);
a(-18,15,23,21,.35,'terminal-roof',0xb4c3c7,7.2);
for(const z of [-36,-16,6,24])for(const x of [-28,-8])a(x,z,.45,.45,7,'column',0xaebdc3);
// The boarding bridge leads directly into the aircraft's front cabin door.
a(7.75,10,25.1,2.4,.3,'jetbridge-floor',0xa6b4b9,2.25);
for(let i=0;i<8;i++)a(-11.3+i*.8,10,.82,2.2,(i+1)*.3,'stairs',0x69828a);
a(7.75,8.85,25.1,.16,1.05,'rail',0xd5b264,2.925);
a(7.75,11.15,25.1,.16,1.05,'rail',0xd5b264,2.925);
// Full playable fuselage: cockpit, two seat rows, a clear center aisle, doors
// onto the boarding bridge, both wings and the rear apron staircase.
a(23,18,5.4,26,.24,'plane-floor',0x899ca5,2.28);
for(const side of [-1,1]) {
 const doors=side<0?[[8.6,11.4],[15.6,18.4]]:[[15.6,18.4],[26.6,29.4]];
 const spans:number[][]=[];let start=5;
 for(const [lo,hi] of doors){if(lo>start)spans.push([start,lo]);start=hi;}if(start<31)spans.push([start,31]);
 for(const [lo,hi] of spans){
  a(23+side*2.7,(lo+hi)/2,.22,hi-lo,1.1,'plane-wall',0xd9ded7,2.95);
  a(23+side*2.7,(lo+hi)/2,.22,hi-lo,.3,'plane-header',0xd9ded7,4.4);
  for(let z=lo+.1;z<hi;z+=1.35)a(23+side*2.7,z,.23,.12,.78,'plane-frame',0xd9ded7,3.88);
 }
 for(const [lo,hi] of doors)for(const z of [lo,hi])a(23+side*2.7,z,.24,.15,2.1,'plane-frame',0xd9ded7,3.45);
 for(const z of [12.8,14.2,20.2,21.6,23,24.4])a(23+side*1.65,z,1.1,.7,1.12,'plane-seat',0x496978,2.96);
}
for(const x of [20.95,25.05])a(x,18,.68,25,.38,'plane-bin',0xd8dbd2,4.72);
for(let i=0;i<10;i++) {const x=-2.7+(i+.5)*.54,roof=4.4+Math.sqrt(1-(x/2.7)**2)*1.1;a(23+x,18,.56,26,.2,'plane-roof',0xd9ded7,roof);}
a(23,5,5.4,.2,1.15,'plane-wall',0xd9ded7,2.975);
a(23,5,5.4,.2,.95,'plane-glass',0x486e83,4.025);
a(23,31,5.4,.2,2.2,'plane-wall',0xd9ded7,3.5);
a(23,6.1,3.4,.65,.6,'console',0x4c6573,2.7);
a(24.5,7,1,.7,1.1,'plane-seat',0x496978,2.95);
a(23,17,27,2.6,.2,'plane-wing',0xaabdc3,2.3);
a(23,29.4,11,2,.2,'plane-wing',0xaabdc3,4.6);
// The rear exit descends sideways, so both the cabin and apron have loops.
for(let i=0;i<8;i++)a(31.8-i*.76,28, .78,2.2,(i+1)*.3,'stairs',0x748b95);
for(const x of [21.3,24.7])for(const z of [9,26])a(x,z,.28,.4,2.2,'plane-gear',0x50626b);
for(const x of [16,30])a(x,17,1.36,3.2,1.36,'plane-engine',0x667f87,1.45);
a(10,25,6,2.3,1.2,'baggage',0x709197);a(33,10,4,2.3,1.2,'baggage',0x709197);
a(1,29,6,1.2,1.25,'counter',0xb4c1c1);

const homestead=shapedArena('homestead','Homestead','Two-story homes, backyard loops, and an enterable bus and truck',88,'suburb',[
  {x:0,z:-25,w:62,d:30},{x:0,z:0,w:40,d:20},{x:0,z:25,w:62,d:30},
],[[-31,-40],[31,-40],[31,-10],[20,-10],[20,10],[31,10],[31,40],[-31,40],[-31,10],[-20,10],[-20,-10],[-31,-10]],v(0,-34),v(0,34),
 {sky:0xc8d7e0,ground:0x9eac8d,fog:.0035,sun:0xffedcf,steel:0x687d80,accent:0xe3c78b});
const h=(x:number,z:number,w:number,d:number,height:number,kind='house-wall',color=0xc9c3ab,y=height/2)=>homestead.boxes.push({x,y,z,w,h:height,d,kind,color});
homestead.boxes.push(...createHomesteadGeometry());
for(const s of [-1,1]) {
 h(-s*23,s*15,10,1.2,1.2,'hedge',0x648158);
 h(s*9,s*8,7,1,1.15,'fence',0xd6cfb6);
}
h(-13,0,1,7,1.1,'fence',0xd6cfb6);h(14,-4,1,5,1.1,'fence',0xd6cfb6);

const derrick=shapedArena('derrick','Derrick','Raised earth, low service routes, and a two-level drilling rig',88,'rig',[
 {x:0,z:-24,w:68,d:24},{x:0,z:14,w:34,d:52},
],[[-34,-36],[34,-36],[34,-12],[17,-12],[17,40],[-17,40],[-17,-12],[-34,-12]],v(0,-29),v(0,33),
 {sky:0xd8c7a6,ground:0xbba47d,fog:.0042,sun:0xffe1b3,steel:0x62705d,accent:0xcf9f46});
const d=(x:number,z:number,w:number,depth:number,height:number,kind='container',color=0x867454,y=height/2)=>derrick.boxes.push({x,y,z,w,h:height,d:depth,kind,color});
for(const s of [-1,1]) {
 d(s*22,-23,9,3,2.8,'container',s<0?0x99563c:0x658084);
 d(s*27,-16,3,7,2.8,'container',0x788574);
 d(s*11,18,3.2,8,3.1,'tank',0xb3a180);
 d(s*11,-3,3,5,2.2,'generator',0x748271);
 d(s*5,-18,4,1,1.2,'barrier');d(s*6,25,4,1,1.25,'barrier');
}
d(0,4,9,10,.32,'deck',0x6b7764,3.04);
d(1,4,6,7,.32,'deck',0x6b7764,6.04);
for(const x of [-4,4])for(const z of [0,8])d(x,z,.32,.32,6,'steel',0xb59b4f);
for(let i=0;i<10;i++)d(2.8,15-i*.7,1.8,.72,(i+1)*.32,'stairs',0x75806b);
for(let i=0;i<10;i++)d(-2.4,7.5-i*.65,1.8,.67,(i+1)*.3,'stairs',0x75806b,3.2+(i+1)*.15);
d(-2.7,.8,2,.6,.32,'deck',0x6b7764,6.04);
d(0,8.9,4,.12,1.05,'rail',0xcfa34e,3.725);
d(4.4,4,.12,10,1.05,'rail',0xcfa34e,3.725);
d(-4.4,4,.12,10,1.05,'rail',0xcfa34e,3.725);
d(3.9,4,.12,7,1.05,'rail',0xcfa34e,6.725);
d(0,4,2.4,2.2,2,'generator',0x62756a);
for(const side of [-1,1])for(let i=0;i<3;i++)d(side*14,10,.44,9,.44,'pipe',0x9a7251,1+i*.6);
// Raised earth shoulders make the center service lane a shallow trench. Wide
// twenty-centimeter terraces behave as slopes in shared fixed-step movement.
for(const side of [-1,1]){
 const levels=side<0?9:6,height=levels*.2;
 d(side*11,-6,8,8,height,'terrain',side<0?0xa8906d:0xbba17a);
 for(let i=0;i<levels;i++)d(side*11,(levels-1-i)*1.2-1.4,8,1.24,(i+1)*.2,'terrain-step',0xb69c75);
 for(const box of derrick.boxes)if(box.kind==='generator'&&box.x===side*11)box.y+=height;
}


function prepareShapedSpawns(map:MapDefinition) {
 const clear=(p:Vec3)=>containsMapPosition(map,p.x,p.z,1)&&!map.boxes.some(b=>b.y-b.h/2<1.75&&b.y+b.h/2>0&&Math.abs(p.x-b.x)<b.w/2+.65&&Math.abs(p.z-b.z)<b.d/2+.65);
 const candidates:Vec3[]=[];
 for(let z=-map.size/2+2;z<map.size/2-1;z+=2)for(let x=-map.size/2+2;x<map.size/2-1;x+=2) {const p=v(x,z);if(clear(p))candidates.push(p);}
 for(const team of ['red','blue'] as const){
  const home=map.flagBases[team],other=map.flagBases[team==='red'?'blue':'red'];
  const ordered=candidates.filter(p=>Math.hypot(p.x-home.x,p.z-home.z)>2&&Math.hypot(p.x-home.x,p.z-home.z)<Math.hypot(p.x-other.x,p.z-other.z)).sort((a,b)=>Math.hypot(a.x-home.x,a.z-home.z)-Math.hypot(b.x-home.x,b.z-home.z));
  for(const p of ordered)if(map.teamSpawns[team].every(other=>Math.hypot(other.x-p.x,other.z-p.z)>=2.2)){map.teamSpawns[team].push(p);if(map.teamSpawns[team].length===16)break;}
 }
 // Farthest-point sampling spreads FFA starts throughout every route rather
 // than reusing two tightly clustered team deployment zones.
 const pool=[...candidates];map.spawns.push({...map.flagBases.red});
 while(map.spawns.length<32&&pool.length){let best=0,distance=-1;for(let i=0;i<pool.length;i++){const nearest=Math.min(...map.spawns.map(p=>Math.hypot(pool[i].x-p.x,pool[i].z-p.z)));if(nearest>distance){distance=nearest;best=i;}}map.spawns.push(pool.splice(best,1)[0]);}
}
for(const map of [airfield,homestead,derrick])prepareShapedSpawns(map);

export const MAPS: readonly MapDefinition[] = [yard,foundry,relay,bazaar,harbor,citadel,junction,oasis,overpass,canal,crossfire,hangar,quarry,outpost,gardens,vault,terminal,switchback,airfield,homestead,derrick];
// Every arena needs at least thirty-two separated FFA starts for a full deployment.
for(const map of MAPS) {
  const candidates=[...map.teamSpawns.red,...map.teamSpawns.blue];
  if(map.spawns.length<32)for(const spawn of candidates.filter(p=>map.spawns.every(other=>Math.hypot(p.x-other.x,p.z-other.z)>1.2))) map.spawns.push(spawn);
  for(const side of [-1,1])for(let i=0;i<3;i++) {
    if(map.footprint)continue;
    map.boxes.push({x:side*(map.size/2-2.1),y:.475,z:side*(map.size/2-9)+i*.74,w:.62,h:.95,d:.62,kind:'barrel'});
  }
}
export function getMap(id:MapId|string = 'yard'):MapDefinition { return MAPS.find(map=>map.id===id) ?? yard; }
