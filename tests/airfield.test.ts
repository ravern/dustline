import test from 'node:test';
import assert from 'node:assert/strict';
import {getMap} from '../shared/map.ts';
import {DT,move,spawnBody} from '../shared/physics.ts';
import type {Body,Input} from '../shared/types.ts';
const base:Input={seq:1,yaw:0,pitch:0,forward:1,right:0,jump:false,sprint:false,crouch:false,ads:false,fire:false,reload:false,slot:0,time:0};
function walk(b:Body,x:number,z:number,map=getMap('airfield')):Body {
 for(let i=0;i<1100;i++){
  if(Math.hypot(b.x-x,b.z-z)<.12)return b;
  b=move(b,{...base,yaw:Math.atan2(b.x-x,b.z-z)},DT,map);
 }
 assert.fail(`Could not walk to ${x},${z}; stopped at ${JSON.stringify(b)}`);
}

test('boarding stairs and bridge lead into the actual aircraft cabin and cockpit',()=>{
 let b=spawnBody({x:-13,y:0,z:10});b=walk(b,23,10);assert.ok(b.y>2.39);
 b=walk(b,23,7.2);assert.ok(b.y>2.39,'cockpit shares the cabin floor');
});

test('the cabin center aisle reaches the rear door and exterior staircase',()=>{
 let b={...spawnBody({x:23,y:2.4,z:10}),grounded:true};
 b=walk(b,23,28);b=walk(b,33,28);
 for(let i=0;i<20;i++)b=move(b,{...base,forward:0},DT,getMap('airfield'));
 assert.ok(b.x>32.8);assert.equal(b.y,0,'rear stairs reach the apron');
});

test('both side exits connect the plane aisle to walkable wings',()=>{
 for(const x of [13,34]){
  let b={...spawnBody({x:23,y:2.4,z:17}),grounded:true};b=walk(b,x,17);
  assert.ok(b.y>2.39&&b.y<2.41);
 }
});

test('the raised dining lounge is accessible from its concourse staircase',()=>{
 let b=spawnBody({x:-24.4,y:0,z:-24});b=walk(b,-24.4,-14.2);assert.ok(b.y>=3.19);
 b=walk(b,-18,-13);assert.ok(b.y>=3.19);
});

test('Derrick earth shoulders rise into cover while the center trench remains low',()=>{
 const map=getMap('derrick');
 for(const [x,height] of [[-8,1.8],[8,1.2]]){
  const b=walk(spawnBody({x,y:0,z:11}),x,-7,map);assert.ok(Math.abs(b.y-height)<.01);
 }
 const b=spawnBody({x:0,y:0,z:-7});assert.equal(move(b,{...base,forward:0},DT,map).y,0);
});

test('adjacent cabin wall and frame cannot push a player sideways into another doorway',()=>{
 const map=getMap('airfield');
 const before:Body={...spawnBody({x:20.855856416144558,y:2.4,z:7.5826245551042835}),vx:-6.8595774562245575,vz:-5.826336509510572,yaw:.8666666666666667,pitch:.1,grounded:true};
 const after=move(before,{...base,yaw:.88,pitch:.1,sprint:true},DT,map);
 assertClear(after,map);
 assert.ok(Math.hypot(after.x-before.x,after.z-before.z)<.16,'a collision cannot displace the player farther than one movement step');
});

test('jumping underneath the boarding bridge resolves its projecting rail as well as the floor',()=>{
 const map=getMap('airfield');
 const before:Body={...spawnBody({x:4.96528674785124,y:.9866666666666667,z:8.36}),vx:-6.847696550409584,vy:2,vz:5.840295543772754,yaw:2.276962718974163,pitch:.0735296499804454};
 const after=move(before,{...base,yaw:before.yaw,pitch:before.pitch,sprint:true},DT,map);
 assertClear(after,map);
 assert.ok(after.z<=8.42,'the rail projects beyond the boarding deck edge');
});

function assertClear(body:Body,map=getMap('airfield')){
 const radius=.35,height=body.stance==='stand'?1.75:body.stance==='slide'?.8:1.05;
 const solid=map.boxes.find(b=>body.x+radius>b.x-b.w/2+1e-5&&body.x-radius<b.x+b.w/2-1e-5&&body.z+radius>b.z-b.d/2+1e-5&&body.z-radius<b.z+b.d/2-1e-5&&body.y+height>b.y-b.h/2+1e-5&&body.y<b.y+b.h/2-1e-5);
 assert.equal(solid,undefined,`player embedded in ${JSON.stringify(solid)}`);
}
