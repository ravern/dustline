import test from 'node:test';
import assert from 'node:assert/strict';
import {collisionIndex,CollisionIndex} from '../shared/collision.ts';
import {MAPS,getMap,type MapDefinition} from '../shared/map.ts';
import {DT,move,spawnBody} from '../shared/physics.ts';
import {rayBox,worldDistance} from '../server/game.ts';
import {advanceGrenade} from '../server/grenades.ts';
import {route} from '../server/navigation.ts';
import type {Box,Input,GrenadeState} from '../shared/types.ts';
let seed=177;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
function fullScan(map:MapDefinition){const index=new CollisionIndex(map.boxes);index.query=()=>map.boxes;index.columns=()=>map.boxes;index.ray=()=>map.boxes;return index;}
const command:Input={seq:0,time:1000,yaw:0,pitch:0,forward:1,right:0,jump:false,sprint:true,crouch:false,ads:false,fire:false,reload:false,slot:0};

test('spatial queries exactly match ordered box scans across every arena',()=>{
 for(const map of MAPS){const index=collisionIndex(map);
  for(let i=0;i<160;i++){
   const x=(random()-.5)*map.size,z=(random()-.5)*map.size,y=random()*8,w=.35+random()*7,h=1.75,d=.35+random()*7;
   const expected=map.boxes.filter(b=>b.x+b.w/2>=x-w&&b.x-b.w/2<=x+w&&b.y+b.h/2>=y&&b.y-b.h/2<=y+h&&b.z+b.d/2>=z-d&&b.z-b.d/2<=z+d);
   assert.deepEqual(index.query(x-w,y,z-d,x+w,y+h,z+d),expected,map.id);
  }
 }
});

test('grid ray traversal preserves nearest hits, including cell edges and vertical rays',()=>{
 for(const map of MAPS){const index=collisionIndex(map),reference=fullScan(map);
  for(let i=0;i<120;i++){
   const from={x:(random()-.5)*map.size*2,y:random()*9,z:(random()-.5)*map.size*2};
   const angle=random()*Math.PI*2,dir=i%12===0?{x:0,y:-1,z:0}:i%12===1?{x:1,y:0,z:0}:i%12===2?{x:0,y:0,z:1}:{x:Math.sin(angle),y:(random()-.5)*.2,z:Math.cos(angle)};
   if(i%12===0)from.x=from.z=8;
   const distance=160,expected=worldDistance(from,dir,distance,map,reference);
   assert.equal(worldDistance(from,dir,distance,map,index),expected,`${map.id} ray ${i}`);
   const candidates=new Set(index.ray(from,dir,distance));
   for(const box of map.boxes){const t=rayBox(from,dir,box);if(t!==null&&t<=distance)assert.ok(candidates.has(box),'every potentially winning hit is returned');}
  }
 }
});

test('static index safely invalidates on push, pop, replacement, reorder and deep geometry edits',()=>{
 const original:Box={x:0,y:1,z:0,w:2,h:2,d:2,kind:'wall'},map={...getMap('yard'),boxes:[original]};
 let index=collisionIndex(map);assert.equal(collisionIndex(map),index);
 const changed=()=>{const next=collisionIndex(map);assert.notEqual(next,index);index=next;assert.equal(collisionIndex(map),next);};
 map.boxes.push({...original,x:12});changed();map.boxes.pop();changed();
 map.boxes[0]={...original};changed();
 for(const key of ['x','y','z','w','h','d'] as const){map.boxes[0][key]+=3;changed();}
 map.boxes.push({...original,x:-10});changed();map.boxes.reverse();changed();
 map.boxes=map.boxes.map(b=>({...b,x:b.x+20}));changed();
 const b=map.boxes[0];assert.ok(index.query(b.x-b.w,0,b.z-b.d,b.x+b.w,20,b.z+b.d).includes(b));
});

test('indexed fixed-step movement is identical to full scans, including vaults, corners and stairs',()=>{
 for(const map of MAPS){const index=collisionIndex(map),reference=fullScan(map);
  for(const start of map.spawns.slice(0,2)){
   let a=spawnBody(start),b=spawnBody(start);
   for(let tick=0;tick<300;tick++){
    const input={...command,seq:tick,yaw:tick*.019,jump:tick%93===0,crouch:tick%151>126,right:tick%83>60?.4:0};
    a=move(a,input,DT,map,index);b=move(b,input,DT,map,reference);assert.deepEqual(a,b,`${map.id} tick ${tick}`);
   }
  }
 }
});

test('indexed grenade sweeps produce exactly the same bounces as full scans',()=>{
 for(const id of ['yard','homestead','airfield'] as const){const map=getMap(id),index=collisionIndex(map),reference=fullScan(map);
  for(let n=0;n<16;n++){
   const from=map.spawns[n],angle=n*.7;
   const a:GrenadeState={id:'test',kind:'frag',owner:'test',team:null,position:{...from,y:1.5},velocity:{x:Math.sin(angle)*14,y:4,z:Math.cos(angle)*14},thrownAt:0,detonateAt:3},b=structuredClone(a);
   for(let tick=0;tick<180;tick++){advanceGrenade(a,DT,map,index);advanceGrenade(b,DT,map,reference);assert.deepEqual(a,b);}
  }
 }
});

test('navigation rebuilds cached connections after deep wall geometry changes',()=>{
 const wall:Box={x:0,y:1.5,z:0,w:4,h:3,d:.25,kind:'wall'};
 const map:MapDefinition={...getMap('yard'),size:24,boxes:[wall],footprint:undefined};
 const from={x:0,y:0,z:-8},to={x:0,y:0,z:8},first=route(map,from,to);
 wall.w=16;const second=route(map,from,to);
 assert.ok(second.some(p=>Math.abs(p.x)>=9));assert.ok(first.every(p=>Math.abs(p.x)<9));
 for(let i=0,p=from;i<second.length;i++){
  const next=second[i],distance=Math.hypot(next.x-p.x,next.z-p.z),dir={x:(next.x-p.x)/distance,y:0,z:(next.z-p.z)/distance};
  if(distance>0)assert.ok(worldDistance({...p,y:1},dir,distance,map)>=distance-.001);p=next;
 }
});


test('a contact that ejects an embedded body across cells still resolves later solids in map order',()=>{
 const map={...getMap('yard'),boxes:[
  {x:12,y:2,z:0,w:20,h:4,d:4,kind:'wall'},
  {x:0,y:2,z:0,w:4,h:4,d:4,kind:'wall'},
 ]};
 const body=spawnBody({x:16,y:0,z:0}),input={...command,forward:0,right:1};
 const expected=move(body,input,DT,map,fullScan(map)),actual=move(body,input,DT,map,collisionIndex(map));
 assert.deepEqual(actual,expected);assert.ok(actual.x< -2.35);
});

test('rays through exact grid corners include solids touching either side cell',()=>{
 const boxes:Box[]=[
  {x:7,y:1,z:8.5,w:2,h:2,d:1,kind:'wall'},
  {x:8.5,y:1,z:7,w:1,h:2,d:2,kind:'wall'},
  {x:-7,y:1,z:-8.5,w:2,h:2,d:1,kind:'wall'},
  {x:-8.5,y:1,z:-7,w:1,h:2,d:2,kind:'wall'},
 ];
 const map={...getMap('yard'),boxes},index=collisionIndex(map);
 for(const sign of [-1,1]){
  const from={x:0,y:1,z:0},dir={x:sign,y:0,z:sign};
  const candidates=index.ray(from,dir,20);
  for(const box of boxes){if(rayBox(from,dir,box)!==null)assert.ok(candidates.includes(box));}
  assert.equal(worldDistance(from,dir,20,map,index),worldDistance(from,dir,20,map,fullScan(map)));
 }
});
