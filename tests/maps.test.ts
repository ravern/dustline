import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, MAP_BOXES, MAP_SIZE, SPAWNS, getMap, type MapDefinition } from '../shared/map.ts';
import { DT, move, PLAYER_RADIUS, spawnBody } from '../shared/physics.ts';
import type { Input, Vec3 } from '../shared/types.ts';

const input:Input={seq:1,yaw:0,pitch:0,forward:0,right:1,jump:false,sprint:false,crouch:false,ads:false,fire:false,reload:false,slot:0,time:0};
function openAt(map:MapDefinition,p:Vec3,height=1.75){
  return Math.abs(p.x)<map.size/2-PLAYER_RADIUS&&Math.abs(p.z)<map.size/2-PLAYER_RADIUS&&!map.boxes.some(b=>
    p.x+PLAYER_RADIUS>b.x-b.w/2&&p.x-PLAYER_RADIUS<b.x+b.w/2&&
    p.z+PLAYER_RADIUS>b.z-b.d/2&&p.z-PLAYER_RADIUS<b.z+b.d/2&&
    p.y+height>b.y-b.h/2&&p.y<b.y+b.h/2);
}

test('all eighteen arenas expose complete spawn sets and the legacy Yard aliases',()=>{
  assert.deepEqual(MAPS.map(map=>map.id),['yard','foundry','relay','bazaar','harbor','citadel','junction','oasis','overpass','canal','crossfire','hangar','quarry','outpost','gardens','vault','terminal','switchback']);
  assert.equal(getMap('yard').boxes,MAP_BOXES);assert.equal(getMap('yard').spawns,SPAWNS);assert.equal(getMap('yard').size,MAP_SIZE);
  for(const map of MAPS){
    assert.ok(map.spawns.length>=32);
    for(const team of ['red','blue'] as const){
      assert.equal(map.teamSpawns[team].length,16);
      assert.ok(openAt(map,map.flagBases[team]),`${map.id} ${team} flag obstructed`);
      for(const p of map.teamSpawns[team])assert.ok(openAt(map,p),`${map.id} ${team} spawn obstructed: ${JSON.stringify(p)}`);
      const positions=map.teamSpawns[team];
      for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)assert.ok(Math.hypot(positions[i].x-positions[j].x,positions[i].z-positions[j].z)>PLAYER_RADIUS*2);
    }
    for(const p of map.spawns)assert.ok(openAt(map,p),`${map.id} FFA spawn obstructed: ${JSON.stringify(p)}`);
    for(const b of map.boxes)assert.ok([b.x,b.y,b.z,b.w,b.h,b.d].every(Number.isFinite)&&b.w>0&&b.h>0&&b.d>0);
  }
});

test('every FFA spawn, team spawn and both flags connect through walkable ground routes',()=>{
  for(const map of MAPS){
    const half=map.size/2,side=map.size+1,seen=new Set<number>();
    const key=(x:number,z:number)=>(x+half)*side+z+half;
    const clear=(x:number,z:number)=>openAt(map,{x,y:0,z});
    const first=map.flagBases.red,queue:[[number,number]]=[[Math.round(first.x),Math.round(first.z)]];
    seen.add(key(queue[0][0],queue[0][1]));
    for(let i=0;i<queue.length;i++){
      const [x,z]=queue[i];
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,nz=z+dz,k=key(nx,nz);
        if(!seen.has(k)&&clear(nx,nz)){seen.add(k);queue.push([nx,nz]);}
      }
    }
    const locations=[...map.spawns,...map.teamSpawns.red,...map.teamSpawns.blue,map.flagBases.blue];
    for(const p of locations)assert.ok(seen.has(key(Math.round(p.x),Math.round(p.z))),`${map.id} isolated position ${JSON.stringify(p)}`);
  }
});

test('movement uses the selected arena collision and bounds, without mutating another arena',()=>{
  const empty:MapDefinition={...getMap('relay'),size:90,boxes:[]};
  const wall:MapDefinition={...empty,boxes:[{x:4,y:2,z:0,w:1,h:4,d:8,kind:'wall'}]};
  let clear=spawnBody({x:0,y:0,z:0}),blocked={...clear};
  for(let i=0;i<180;i++){clear=move(clear,input,DT,empty);blocked=move(blocked,input,DT,wall);}
  assert.ok(clear.x>15);assert.ok(blocked.x<3.151);
  for(let i=0;i<600;i++)clear=move(clear,input,DT,empty);
  assert.ok(clear.x<=45-PLAYER_RADIUS&&clear.x>44);
  assert.equal(empty.boxes.length,0);
});

test('Raised routes can be reached up their stairs without jumping',()=>{
  for(const [id,x,start,height] of [['foundry',18.8,17,3.6],['relay',20,13,3],['citadel',18.8,17,3.6],['overpass',16,16,3.6]] as const){
    const map=getMap(id);let b=spawnBody({x,y:0,z:start}),highest=0;
    for(let i=0;i<145;i++){b=move(b,{...input,right:0,forward:1},DT,map);highest=Math.max(highest,b.y);}
    assert.ok(highest>=height-.001,`${id} staircase only reached ${highest}`);
  }
});
