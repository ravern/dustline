import test from 'node:test';
import assert from 'node:assert/strict';
import {getMap,type MapDefinition,containsMapPosition} from '../shared/map.ts';
import {move,spawnBody,DT,bodyHeight,VAULT_DURATION,PLAYER_RADIUS} from '../shared/physics.ts';
import type {Body,Box,Input} from '../shared/types.ts';
const input=(patch:Partial<Input>={}):Input=>({seq:1,yaw:0,pitch:0,forward:1,right:0,jump:true,sprint:false,crouch:false,ads:false,fire:false,reload:false,slot:0,time:0,...patch});
const cover:Box={x:0,y:.65,z:-1.5,w:4,h:1.3,d:.85,kind:'barrier'};
const map=(boxes:Box[]):MapDefinition=>({...getMap('yard'),boxes});
const occupied=(b:Body,box:Box)=>Math.abs(b.x-box.x)<PLAYER_RADIUS+box.w/2-1e-5&&Math.abs(b.z-box.z)<PLAYER_RADIUS+box.d/2-1e-5&&b.y<box.y+box.h/2-1e-5&&b.y+bodyHeight(b)>box.y-box.h/2+1e-5;

test('Space near waist-high cover follows a collision-free vault and lands beyond it',()=>{
 const arena=map([cover]);let b=spawnBody({x:0,y:0,z:0}),started=false;
 for(let i=0;i<Math.ceil(VAULT_DURATION/DT)+1;i++){
  const before={...b};b=move(b,input(),DT,arena);started ||= !!b.vault;
  assert.ok(!occupied(b,cover),`entered cover at tick ${i}`);
  assert.ok(Math.hypot(b.x-before.x,b.y-before.y,b.z-before.z)<.4,'vault advances smoothly');
 }
 assert.ok(started);assert.equal(b.vault,undefined);assert.ok(b.z<cover.z-cover.d/2-PLAYER_RADIUS);assert.equal(b.grounded,true);assert.equal(b.y,0);
});

test('a blocked landing, low ceiling, tall wall, and wide solid each reject a vault',()=>{
 for(const obstacle of [
  {...cover,h:2.2,y:1.1},
  {...cover,d:4,z:-3},
 ])assert.equal(move(spawnBody({x:0,y:0,z:0}),input(),DT,map([obstacle])).vault,undefined);
 for(const blocker of [
  {x:0,y:1.5,z:-2.5,w:5,h:3,d:.3,kind:'wall'},
  {x:0,y:2.1,z:-1.4,w:5,h:.3,d:5,kind:'roof'},
 ]){
  const arena=map([cover,blocker]);let b=spawnBody({x:0,y:0,z:0});
  b=move(b,input(),DT,arena);assert.equal(b.vault,undefined);
 }
});

test('standing still, holding Space, and approaching from the back do not auto-vault',()=>{
 const arena=map([cover]);
 assert.equal(move(spawnBody({x:0,y:0,z:0}),input({forward:0}),DT,arena).vault,undefined);
 assert.equal(move({...spawnBody({x:0,y:0,z:0}),jumpHeld:true},input(),DT,arena).vault,undefined);
 assert.equal(move(spawnBody({x:0,y:0,z:0}),input({forward:-1}),DT,arena).vault,undefined);
});

test('server simulation and prediction replay produce identical complete vault state',()=>{
 const arena=map([cover]);let server=spawnBody({x:0,y:0,z:0}),predicted={...server};
 for(let tick=0;tick<60;tick++){
  const command=input({seq:tick,yaw:tick<8?0:.12,jump:tick<35});
  server=move(server,command,DT,arena);predicted=move(predicted,command,DT,arena);
  assert.deepEqual(predicted,server);
 }
});

test('a thin obstacle added during a vault aborts it without crossing the new solid',()=>{
 const arena=map([cover]);let b=spawnBody({x:0,y:0,z:0});
 for(let i=0;i<12;i++)b=move(b,input(),DT,arena);
 assert.ok(b.vault);
 const blocker={x:0,y:2,z:b.z-.55,w:5,h:4,d:.1,kind:'wall'};arena.boxes.push(blocker);
 for(let i=0;i<8;i++){b=move(b,input(),DT,arena);assert.ok(!occupied(b,blocker));}
 assert.equal(b.vault,undefined);
});

test('non-square cutouts remain impassable even above their perimeter walls',()=>{
 for(const [id,start,command] of [
  ['airfield',{x:0,y:7,z:-20},{right:1,forward:0}],
  ['homestead',{x:18,y:7,z:0},{right:1,forward:0}],
  ['derrick',{x:15,y:7,z:15},{right:1,forward:0}],
 ] as const){
  const arena=getMap(id);let b=spawnBody(start);
  for(let i=0;i<80;i++){b=move(b,input({...command,jump:false}),DT,arena);assert.ok(containsMapPosition(arena,b.x,b.z,PLAYER_RADIUS),`${id} escaped its footprint`);}
 }
});
