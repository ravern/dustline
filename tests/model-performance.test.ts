import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildSoldier,buildLocalBody,buildWeapon,poseSoldier,setSoldierTeam} from '../src/models.ts';
import {RemoteActor,useDistantActor} from '../src/remote-actor.ts';
import {ShotEffects} from '../src/shot-effects.ts';
import {spawnBody} from '../shared/physics.ts';
import type {WeaponId} from '../shared/types.ts';

function stats(root:THREE.Object3D){
  let triangles=0,draws=0,nodes=0;const skeletons=new Set<THREE.Skeleton>(),geometries=new Set<THREE.BufferGeometry>();
  root.traverse(object=>{nodes++;if(object instanceof THREE.Mesh){draws++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;geometries.add(object.geometry);if(object instanceof THREE.SkinnedMesh)skeletons.add(object.skeleton);}});
  return {triangles,draws,nodes,skeletons,geometries};
}

test('distant actors remove geometry cost while preserving articulated landmarks and team readability',()=>{
  const high=buildSoldier(),low=buildSoldier(undefined,false,true),h=stats(high),l=stats(low);
  assert.ok(l.triangles<1500&&l.triangles<h.triangles*.12);assert.equal(l.draws,2);
  assert.equal(h.skeletons.size,1);assert.equal(l.skeletons.size,1);assert.notEqual([...h.skeletons][0],[...l.skeletons][0]);
  const sibling=buildSoldier();assert.notEqual([...stats(sibling).skeletons][0],[...h.skeletons][0]);
  for(const stance of ['stand','crouch','slide']as const){
    const body={...spawnBody({x:0,y:0,z:0}),stance,pitch:.3,vx:3};
    for(let i=0;i<40;i++){poseSoldier(high,body,i/60,1/60);poseSoldier(low,body,i/60,1/60);}
    high.updateMatrixWorld(true);low.updateMatrixWorld(true);
    for(const name of ['hips','head','leftLeg','rightLeg','leftShin','rightShin','leftArm','rightArm','weaponAnchor']){
      const a=high.getObjectByName(name)!,b=low.getObjectByName(name)!;
      assert.ok(a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()))<.0001,`${name} ${stance}`);
    }
  }
  setSoldierTeam(low,'blue',true);let patches=0;
  low.traverse(object=>{if(object instanceof THREE.Mesh){const m=object.material as THREE.MeshStandardMaterial;if(m.userData.team){patches++;assert.equal(m.color.getHex(),0x5795d9);}else assert.equal(m.vertexColors,true);}});
  assert.equal(patches,1);
});

test('every distant weapon stays one draw and below 500 triangles with a distinct silhouette',()=>{
  const dimensions=new Map<string,string>();
  for(const id of ['intervention','ak47','scar','m9','deagle','glock','knife']as WeaponId[]){
    const model=buildWeapon(id,false,true),s=stats(model);assert.equal(s.draws,1);assert.ok(s.triangles<500,`${id}: ${s.triangles}`);
    const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());dimensions.set(id,size.toArray().map(v=>v.toFixed(3)).join(','));
    assert.ok(size.z>.2);assert.equal(model.getObjectByName('weaponAsset'),undefined);
  }
  assert.notEqual(dimensions.get('deagle'),dimensions.get('glock'));assert.notEqual(dimensions.get('ak47'),dimensions.get('scar'));
});

test('LOD and weapon crossings reuse actors, rigs and geometry, and scopes keep close detail',async t=>{
  t.mock.method(GLTFLoader.prototype,'loadAsync',()=>new Promise(()=>{}));
  const actor=new RemoteActor(0x657059),low=actor.select(true);actor.setShadows(false);actor.setWeapon('ak47');
  const weapon=low.getObjectByName('heldWeapon');const geometries=stats(low).geometries;
  const high=actor.select(false);assert.notEqual(high,low);poseSoldier(high,spawnBody({x:0,y:0,z:0}),0,1/60);high.userData.gait=2;
  for(let i=0;i<20;i++){assert.equal(actor.select(true),low);actor.setWeapon('scar');actor.setWeapon('ak47');assert.equal(actor.select(false),high);}
  actor.select(true);assert.equal(low.userData.gait,2);assert.equal(low.getObjectByName('heldWeapon'),weapon);assert.equal(weapon!.visible,true);
  for(const geometry of geometries)assert.ok(stats(low).geometries.has(geometry));assert.equal(actor.variants.size,2);
  assert.equal(useDistantActor(12,false,'high',82),false);assert.equal(useDistantActor(12,true,'high',82),true);
  assert.equal(useDistantActor(50,false,'high',82),true);assert.equal(useDistantActor(50,true,'high',17),false);
});

test('pose updates cache their rig and the local body omits invisible upper geometry',()=>{
  const local=buildLocalBody(),remote=buildSoldier();assert.equal(local.getObjectByName('leftArm'),undefined);assert.equal(local.getObjectByName('head'),undefined);
  const body=spawnBody({x:0,y:0,z:0});poseSoldier(remote,body,0,1/60);
  remote.traverse(object=>{object.getObjectByName=()=>{throw new Error('pose must use cached joints');};});
  for(let i=0;i<100;i++)poseSoldier(remote,{...body,pitch:i*.005},i/60,1/60);
  assert.ok(stats(local).nodes<35);
});

test('bursts reuse shot buffers and materials, remain bounded, and expire completely',()=>{
  const scene=new THREE.Scene(),effects=new ShotEffects(scene),from={x:0,y:1,z:0},to={x:2,y:1,z:-3};
  effects.spawn(from,to,0,true);const first=scene.children[0],line=first.children[0]as THREE.Line,buffer=line.geometry,material=line.material;
  effects.update(.06);assert.equal(line.visible,false);assert.equal(first.children[1].visible,true);
  effects.update(.09);assert.equal(scene.children.length,0);effects.spawn(to,from,1,true);
  assert.equal(scene.children[0],first);assert.equal(line.geometry,buffer);assert.equal(line.material,material);
  assert.equal(buffer.attributes.position.getX(0),2);assert.equal(buffer.attributes.position.getZ(1),0);
  for(let i=0;i<100;i++)effects.spawn(from,to,1,true);assert.equal(effects.count,32);
  effects.clear();assert.equal(effects.count,0);assert.equal(scene.children.length,0);
  for(let i=0;i<100;i++)effects.spawn(from,to,2,false);assert.equal(effects.count,16);effects.update(3);assert.equal(scene.children.length,0);
});
