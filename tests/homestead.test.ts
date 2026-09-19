import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomesteadGeometry} from '../shared/homestead.ts';
import {getMap} from '../shared/map.ts';
import {move,spawnBody,DT,bodyHeight,PLAYER_RADIUS} from '../shared/physics.ts';
import type {Body,Box,Input,Vec3} from '../shared/types.ts';

const geometry=createHomesteadGeometry();
const map={...getMap('homestead'),boxes:geometry};
const command=(yaw:number):Input=>({seq:1,yaw,pitch:0,forward:1,right:0,jump:false,sprint:false,crouch:false,ads:false,fire:false,reload:false,slot:0,time:0});
const occupied=(b:Body,box:Box)=>Math.abs(b.x-box.x)<PLAYER_RADIUS+box.w/2-1e-5&&Math.abs(b.z-box.z)<PLAYER_RADIUS+box.d/2-1e-5&&b.y<box.y+box.h/2-1e-5&&b.y+bodyHeight(b)>box.y-box.h/2+1e-5;
const house=(side:number,x:number,z:number,y=0):Vec3=>({x:side*(8+x),y,z:side*(23+z)});

function walk(body:Body,target:Vec3):Body {
  for(let tick=0;tick<600;tick++) {
    const dx=target.x-body.x,dz=target.z-body.z;
    if(Math.hypot(dx,dz)<.16) {
      assert.ok(Math.abs(body.y-target.y)<.24,`wrong level: ${JSON.stringify(body)}; expected ${JSON.stringify(target)}`);
      return body;
    }
    body=move(body,command(Math.atan2(-dx,-dz)),DT,map);
    assert.ok(!geometry.some(box=>occupied(body,box)),`entered a solid at ${JSON.stringify(body)}`);
  }
  assert.fail(`route blocked at ${JSON.stringify(body)} towards ${JSON.stringify(target)}`);
}

for(const side of [-1,1]) {
  test(`Homestead ${side}: front door, living room, kitchen and backyard form a ground route`,()=>{
    let b=spawnBody(house(side,0,-8));
    for(const [x,z] of [[0,-4],[0,3],[-3.7,3.5],[-3.7,7.5]]) b=walk(b,house(side,x,z));
  });
  test(`Homestead ${side}: indoor stairs, upper landing, balcony and outdoor stairs form a loop`,()=>{
    let b=spawnBody(house(side,0,-8));
    for(const [x,z,y] of [[0,-4.8,0],[4.7,-5.45,0],[4.7,3.4,3.2],[0,3.8,3.2],[0,7.1,3.2],[5.5,7.1,3.2],[5.5,15.85,0]]) b=walk(b,house(side,x,z,y));
    for(const [x,z,y] of [[5.5,7.1,3.2],[0,7.1,3.2],[0,3.8,3.2],[4.7,3.4,3.2],[4.7,-5.45,0]]) b=walk(b,house(side,x,z,y));
  });
  test(`Homestead ${side}: garage has street, interior and backyard access`,()=>{
    let b=spawnBody(house(side,-9.2,-5));
    for(const [x,z] of [[-9.2,2.1],[-5,2.1],[-9.2,2.1],[-9.2,5.5]]) b=walk(b,house(side,x,z));
  });
  test(`Homestead ${side}: upstairs corridor reaches both bedrooms and the street-facing windows`,()=>{
    let b={...spawnBody(house(side,4.7,3.4,3.2)),grounded:true};
    for(const [x,z] of [[0,3.8],[0,1.2],[-3.5,1.2],[-3.5,-3.8],[-4.4,-5.3],[-3.5,-3.8],[-3.5,1.2],[-4.4,4.8]]) b=walk(b,house(side,x,z,3.2));
  });
}

test('Homestead bus and open truck have standing-height playable interiors',()=>{
  let b=spawnBody({x:-.8,y:0,z:-5.5});
  for(const p of [{x:-4,y:.32,z:-5.5},{x:-4,y:.32,z:1.6},{x:-.8,y:0,z:1.6}]) b=walk(b,p);
  b=spawnBody({x:7,y:0,z:8});
  for(const p of [{x:7,y:.4,z:4},{x:7,y:.4,z:1},{x:7,y:0,z:8}]) b=walk(b,p);
});

test('Homestead flag bases stay clear and upper windows are genuine wall openings',()=>{
  for(const side of [-1,1]) {
    const flag=spawnBody({x:0,y:0,z:side*34});
    assert.ok(!geometry.some(box=>occupied(flag,box)));
    const sight=house(side,0,-6,4.8);
    assert.ok(!geometry.some(box=>Math.abs(box.x-sight.x)<box.w/2&&Math.abs(box.z-sight.z)<box.d/2&&Math.abs(box.y-sight.y)<box.h/2),'upper front sightline is blocked');
    assert.ok(geometry.some(box=>Math.abs(box.x-sight.x)<box.w/2&&Math.abs(box.z-sight.z)<box.d/2&&Math.abs(box.y-3.5)<box.h/2),'upper window has no sill');
  }
});
