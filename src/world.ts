import * as THREE from 'three';
import { containsMapPosition, sceneryInnerRadius, getMap, type MapDefinition } from '../shared/map';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Box } from '../shared/types';
import { loadAssetKit } from './assets';
import { createWorldLighting, type WorldLighting } from './lighting';
import { surfaceTexture, tileWorldMaterial } from './surface-materials';

export interface WorldPropSlot { kind: 'crate' | 'barrier' | 'barrel'; box: Box; root: THREE.Group }
/** Static architecture is instanced/merged; only dust and a small flag animate. */
export function buildWorld(scene:THREE.Scene,map:MapDefinition=getMap('yard')):{root:THREE.Group;map:MapDefinition;propSlots:WorldPropSlot[];lighting:WorldLighting;setQuality(quality:'low'|'high'):void;update(time:number):void;dispose():void} {
 const propSlots:WorldPropSlot[]=[];let disposed=false,detailMode=false,quality:'low'|'high'='high';
 const root=new THREE.Group();root.name=`Dustline / ${map.name}`;scene.add(root);
 const decoration=new THREE.Group();decoration.name='Exterior scenery';root.add(decoration);
 const lighting=createWorldLighting(scene,map);
 const mats:THREE.Material[]=[];const textures:THREE.Texture[]=[];const geos:THREE.BufferGeometry[]=[];
 const mat=(color:number,roughness=.83,metalness=.05,map?:THREE.Texture)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness,...(map?{map}:{})});tileWorldMaterial(m);mats.push(m);return m;};
 let seed=map.id==='yard'?81723:map.id==='foundry'?17294:51637;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const metalMap=surfaceTexture('steel'),concreteMap=surfaceTexture('concrete'),woodMap=surfaceTexture('wood'),clothMap=surfaceTexture('fabric');
 const groundMap=surfaceTexture(map.architecture==='suburb'?'grass':map.id==='yard'||map.architecture==='rig'?'sand':'concrete');
 const sand=mat(0xffffff,1,0,groundMap),steel=mat(map.theme.steel,.74,.57,metalMap),yellow=mat(map.theme.accent,.68,.4,metalMap);
 const concrete=mat(map.id==='yard'?0xb5ad93:0x9ba6ab,.96,0,concreteMap),dark=mat(map.id==='yard'?0x2e352f:0x3c4e59,.76,.22,metalMap),rust=mat(0x794b31,.87,.35,metalMap),wood=mat(0x86754f,.98,0,woodMap);
 sand.bumpMap=groundMap;sand.bumpScale=.035;concrete.bumpMap=concreteMap;concrete.bumpScale=.035;steel.bumpMap=metalMap;steel.bumpScale=.009;wood.bumpMap=woodMap;wood.bumpScale=.013;
 const silverMetal=mat(0x99998c,.45,.75);
 const blue=mat(0x496465,.84,.22,metalMap),dustMat=mat(0x8c7755,1,0),ivory=mat(map.id==='yard'?0xd4c9a5:0xc4d1d5,.85,.15,metalMap);
 const cache=new Map<number,THREE.MeshStandardMaterial>(),architectureMaterials=new Map<string,THREE.MeshStandardMaterial>();
 const signCache=new Map<string,THREE.MeshStandardMaterial>();
 const colored=(color:number)=>{if(!cache.has(color)){const m=mat(color,.81,.2,metalMap);m.bumpMap=metalMap;m.bumpScale=.014;cache.set(color,m);}return cache.get(color)!;};
 const unitBox=new THREE.BoxGeometry(1,1,1);geos.push(unitBox);
 // Batch repeated architecture by material to leave frame time for the game.
 const batches=new Map<THREE.Material,THREE.Matrix4[]>(),detailBatches=new Map<THREE.Material,THREE.Matrix4[]>();const dummy=new THREE.Object3D();
 function box(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,ry=0){dummy.position.set(x,y,z);dummy.rotation.set(0,ry,0);dummy.scale.set(w,h,d);dummy.updateMatrix();const batch=detailMode?detailBatches:batches;if(!batch.has(m))batch.set(m,[]);batch.get(m)!.push(dummy.matrix.clone());}
 function mesh(geo:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number){geos.push(geo);const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;(detailMode?decoration:root).add(o);return o;}
 function cylinder(m:THREE.Material,x:number,y:number,z:number,r:number,h:number,axis='y',r2=r,sides=16){const o=mesh(new THREE.CylinderGeometry(r,r2,h,sides),m,x,y,z);if(axis==='z')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.z=Math.PI/2;return o;}
 function beam(m:THREE.Material,a:THREE.Vector3,b:THREE.Vector3,width:number){const mid=a.clone().add(b).multiplyScalar(.5);const o=mesh(new THREE.BoxGeometry(width,a.distanceTo(b),width),m,mid.x,mid.y,mid.z);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return o;}
 function sign(text:string,bg:string,fg:string,x:number,y:number,z:number,w:number,h:number,ry=0,rz=0){
  const key=`${text}/${bg}/${fg}`;let m=signCache.get(key);
  if(!m){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;const c=canvas.getContext('2d')!;c.fillStyle=bg;c.fillRect(0,0,768,256);c.strokeStyle=fg;c.lineWidth=5;c.strokeRect(16,16,736,224);c.fillStyle=fg;c.font='900 88px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(text,384,136,710);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);m=new THREE.MeshStandardMaterial({map:t,roughness:.92,side:THREE.DoubleSide});mats.push(m);signCache.set(key,m);}
  const o=mesh(new THREE.PlaneGeometry(w,h),m,x,y,z);o.rotation.set(0,ry,rz);return o;
 }
 const floor=mesh(new THREE.PlaneGeometry(280,280),sand,0,-.025,0);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
 // Faded truck tracks and settling dirt anchor the structures in the sand.
 for(let lane=0;lane<3;lane++)for(const side of [-1,1])for(let j=0;j<46;j++)box(dustMat,-23+lane*23+side*.67,-.007,-27+j*1.19,.31,.014,.72);
 for(const b of map.boxes) {
  const m=architectureMaterial(b)??(b.color?colored(b.color):b.kind==='boundary'||b.kind==='wall'||b.kind==='plinth'?concrete:b.kind==='deck'||b.kind==='stairs'?steel:b.kind==='rail'?yellow:b.kind==='crate'?wood:b.kind==='steel'?yellow:b.kind==='barrier'?concrete:steel);
  if(b.kind==='plane-roof')continue;
  if(b.kind==='plane-seat'){architectureDetail(b);continue;}
  if(b.kind==='plane-engine'){cylinder(m,b.x,b.y,b.z,b.w/2,b.d,'z');continue;}
  if(b.kind==='pipe'){cylinder(rust,b.x,b.y,b.z,b.w/2,b.d,'z');continue;}
  if(b.kind==='perimeter'){perimeter(b);continue;}
  if(b.kind==='tank'){tank(b,m);continue;}
  if(b.kind==='rail'){railing(b);continue;}
  if(b.kind==='crate'||b.kind==='barrier'||b.kind==='barrel'){
   const slot=new THREE.Group();slot.name=`${b.kind} asset slot`;root.add(slot);
   const fallback=new THREE.Mesh(unitBox,m);fallback.position.set(b.x,b.y,b.z);fallback.scale.set(b.w,b.h,b.d);fallback.castShadow=true;fallback.receiveShadow=true;slot.add(fallback);propSlots.push({kind:b.kind,box:b,root:slot});
  }else box(m,b.x,b.y,b.z,b.w,b.h,b.d);
  if(b.kind==='container')container(b,m);
  if(b.kind==='generator'||b.kind==='console')generator(b,m);
  if(b.kind==='station')station(b);
  if(b.kind==='furnace')furnace(b);
  if(b.kind==='relay')relayCabinet(b);
  if(map.architecture)architectureDetail(b);
  if(b.kind==='stairs')box(yellow,b.x,b.y+b.h/2+.009,b.z+b.d/2-.025,b.w,.018,.055);
  if(b.kind==='boundary'){
   const alongX=b.w>b.d,length=alongX?b.w:b.d;
   for(let n=-length/2+1;n<length/2;n+=3)box(steel,b.x+(alongX?n:0),4.55,b.z+(alongX?0:n),.1,2.5,.1);
   box(rust,b.x,4.1,b.z,alongX?length:.055,.04,alongX?.055:length);
   box(rust,b.x,5.65,b.z,alongX?length:.055,.04,alongX?.055:length);
   for(let n=-length/2;n<length/2;n+=.35)box(rust,b.x+(alongX?n:0),4.7,b.z+(alongX?0:n),.02,1.9,.02);
   for(let n=-length/2+2;n<length/2;n+=5)box(concrete,b.x+(alongX?n:0),1.72,b.z+(alongX?0:n),alongX?.15:b.w+.05,3.44,alongX?b.d+.05:.15);
  }
 }
 function architectureMaterial(b:Box):THREE.MeshStandardMaterial|undefined{
  if(!map.architecture&&!b.kind.startsWith('terrain'))return;
  const painted=['house-wall','house-header','house-sill','garage-wall','shop-wall','shop-roof','terminal-roof','house-roof','house-floor','house-sofa','house-bed','house-counter','plane-wall','plane-floor','plane-header','plane-frame','plane-wing','plane-roof','plane-bin','plane-seat','vehicle-floor','vehicle-wall','vehicle-roof','terrain','terrain-step'];
  if(!painted.includes(b.kind))return;
  const isWood=['house-wall','house-header','house-sill','house-counter'].includes(b.kind),terrain=b.kind.startsWith('terrain');
  const aircraft=b.kind.startsWith('plane-'),fabric=['plane-seat','plane-floor','house-sofa','house-bed'].includes(b.kind);
  const key=`${fabric?'fabric':aircraft?'aircraft':isWood?'siding':terrain?'earth':'paint'}/${b.color??0xb9c4c4}`;let material=architectureMaterials.get(key);
  if(!material){const albedo=fabric?clothMap:aircraft?metalMap:isWood?woodMap:terrain?groundMap:concreteMap;material=mat(b.color??0xb9c4c4,fabric||terrain?1:.94,0,albedo);if(albedo){material.bumpMap=albedo;material.bumpScale=fabric?.001:terrain?.045:.012;}architectureMaterials.set(key,material);}
  return material;
 }
 function perimeter(b:Box){
  const long=b.w>b.d,length=long?b.w:b.d;
  const panel=map.architecture==='suburb'?colored(0x829072):map.architecture==='airport'?colored(0x8196a3):concrete;
  box(panel,b.x,b.y,b.z,b.w,b.h,b.d);box(ivory,b.x,b.h-.08,b.z,b.w+.05,.16,b.d+.05);
  for(let n=-length/2+.3;n<length/2;n+=3){const x=b.x+(long?n:0),z=b.z+(long?0:n);box(map.architecture==='rig'?yellow:ivory,x,b.h/2,z,long?.13:b.w+.06,b.h,long?b.d+.06:.13);}
  if(map.architecture==='airport')for(const side of [-1,1]){
   box(colored(0x557788),b.x+(long?0:side*(b.w/2+.014)),3.2,b.z+(long?side*(b.d/2+.014):0),long?length-.2:.025,1.8,long?.025:length-.2);
   box(ivory,b.x,2.1,b.z,b.w+.04,.14,b.d+.04);
  }
 }
 function architectureDetail(b:Box){
  const top=b.y+b.h/2;
  if(['shop','garage','kiosk'].includes(b.kind)){
   box(ivory,b.x,top-.1,b.z,b.w+.1,.2,b.d+.1);
   for(const side of [-1,1]){
    box(dark,b.x,b.y+.25,b.z+side*(b.d/2+.018),b.w*.82,b.h*.48,.032);
    for(let x=-b.w*.37;x<b.w*.4;x+=1.2)box(ivory,b.x+x,b.y+.25,b.z+side*(b.d/2+.045),.065,b.h*.5,.04);
   }
   if(b.kind==='shop')sign('DEPARTURES / 07','#283f50','#e6e9df',b.x,top-.48,b.z+b.d/2+.075,b.w-.4,.4);
   if(b.kind==='garage')for(let i=0;i<9;i++)box(ivory,b.x,.35+i*.22,b.z+b.d/2+.035,b.w-.6,.025,.025);
  }
  if(b.kind==='plane-seat'){
   const bottom=b.y-b.h/2,cloth=architectureMaterial({...b,kind:'plane-seat',color:0x435d69})!;
   box(cloth,b.x,bottom+.48,b.z,b.w,.18,b.d);
   box(cloth,b.x,bottom+.84,b.z+.24,b.w,.56,.2);
   box(colored(0x71818a),b.x,bottom+.22,b.z,.18,.42,.18);
   for(const side of [-1,1])box(ivory,b.x+side*(b.w/2-.055),bottom+.66,b.z,.075,.09,b.d-.12);
  }
  if(b.kind==='plane-header'||b.kind==='plane-frame')box(architectureMaterial(b)!,b.x,b.y,b.z,b.w+.025,b.h,b.d+.025);
  if(b.kind==='shop-wall')box(ivory,b.x,top-.12,b.z,b.w+.06,.16,b.d+.06);
  if(['house-wall','house-header','house-sill','garage-wall'].includes(b.kind)){
   // Every strip stays on its shared wall segment, leaving actual doors and
   // windows open. Siding on the old full facade would cover those holes.
   for(let y=Math.ceil((b.y-b.h/2)/.29)*.29+.02;y<top;y+=.29)box(ivory,b.x,y,b.z,b.w+.024,.014,b.d+.024);
   if(b.kind==='house-sill')box(ivory,b.x,top+.01,b.z,b.w+.07,.035,b.d+.07);
  }
  if(b.kind==='house-sofa'){
   box(colored(0x61766c),b.x,top-.13,b.z+b.d/2-.16,b.w,.24,.3);
   for(const side of [-1,1])box(colored(0x61766c),b.x+side*(b.w/2-.13),top-.17,b.z,.25,.32,b.d);
  }
  if(b.kind==='house-counter')box(ivory,b.x,top-.025,b.z,b.w+.02,.05,b.d+.02);
  if(b.kind==='house-bed'){
   box(ivory,b.x,top-.035,b.z-b.d/2+.32,b.w-.2,.06,.45);
   box(colored(0x839686),b.x,top-.025,b.z+.25,b.w-.04,.04,b.d-.7);
  }
  if(b.kind==='vehicle-roof'){
   for(const side of [-1,1]){
    box(ivory,b.x+side*(b.w/2-.04),b.y-.04,b.z,.055,.06,b.d-.15);
    for(const z of [-b.d*.31,b.d*.31])cylinder(dark,b.x+side*(b.w/2-.08),.3,b.z+z,.3,.16,'x',.3,12);
   }
  }
  if(b.kind==='house-roof'){
   box(ivory,b.x,top-.04,b.z,b.w+.05,.12,b.d+.05);
   for(const s of [-1,1])box(colored(0x6f817c),b.x+s*(b.w/2-.25),top+.025,b.z,.1,.025,b.d-.3);
  }
  if(b.kind==='fence'){
   for(const side of [-1,1])box(ivory,b.x,top-.2,b.z+side*(b.d/2+.02),b.w,.08,.035);
   if(b.w>b.d)for(let x=-b.w/2+.1;x<b.w/2;x+=.3)box(wood,b.x+x,b.y,b.z,.025,b.h+.03,b.d+.035);
  }
  if(b.kind==='hedge'){
   const leaf=colored(0x758d60);for(let x=-b.w/2+.25;x<b.w/2;x+=.65)box(leaf,b.x+x,top-.08,b.z,.56,.16,b.d-.07);
  }
  if(b.kind==='shuttle'||b.kind==='caravan'){
   box(ivory,b.x,top-.12,b.z,b.w-.1,.24,b.d-.1);
   for(const s of [-1,1]){
    box(dark,b.x+s*(b.w/2+.015),top-.67,b.z,.025,.7,b.d-.6);
    for(let z=-b.d/2+.45;z<b.d/2;z+=1.4)box(ivory,b.x+s*(b.w/2+.03),top-.67,b.z+z,.045,.76,.06);
    for(const z of [-b.d*.31,b.d*.31])cylinder(dark,b.x+s*(b.w/2-.09),.38,b.z+z,.38,.2,'x',.38,12);
    box(colored(0xd3b954),b.x,.7,b.z+s*(b.d/2+.015),b.w-.3,.16,.028);
   }
   box(colored(0x76919c),b.x,top-.64,b.z-b.d/2-.016,b.w-.3,.77,.03);
  }
  if(b.kind==='counter'||b.kind==='bench'||b.kind==='baggage'){
   box(ivory,b.x,top-.045,b.z,b.w+.05,.09,b.d+.05);
   if(b.kind==='baggage')for(let i=0;i<4;i++)box(colored(i%2?0x655e51:0x987354),b.x-b.w*.36+i*b.w*.24,top-.3,b.z,.7,.42,b.d*.8);
   else for(let x=-b.w/2+.2;x<b.w/2;x+=.65)box(steel,b.x+x,b.y,b.z+b.d/2+.018,.04,b.h-.2,.03);
  }
 }
 function originalLandmarks(){
  if(map.architecture==='airport'){
   sign('A I R F I E L D','#263f51','#e7dfbe',-18,5.2,-37,11,.65);
   sign('GATES  01 — 08  →','#264657','#ecdfab',-18,4.9,7,10,.8);
   sign('BAGGAGE / APRON','#264657','#ecdfab',11,3.7,33.67,12,.7,Math.PI);
   for(const z of [-32,-20,10,22]){box(ivory,-18,6.13,z,15,.09,.14);box(yellow,-18,6.12,z,4,.11,.17);}
   // Shared collision defines the cabin walls, seats, floor and every door.
   // Only the curved skin and tail are decorative; no walkable space is hidden.
   const fuselage=mat(0xd9e0db,.7,.08),positions:number[]=[],indices:number[]=[];
   fuselage.side=THREE.DoubleSide;
   for(const z of [5,31])for(let i=0;i<=24;i++){const angle=i/24*Math.PI;positions.push(23+Math.cos(angle)*2.7,4.4+Math.sin(angle)*1.1,z);}
   for(let i=0;i<24;i++){const a=i,b=i+1,c=i+25,d=i+26;indices.push(a,c,b,b,c,d);}
   const roof=new THREE.BufferGeometry();roof.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));roof.setIndex(indices);roof.computeVertexNormals();mesh(roof,fuselage,0,0,0);
   box(colored(0x3f677b),23,7.3,29.4,.25,4.3,2.6);
   const cabinLight=mat(0xffe7b7,.8,0);cabinLight.emissive.setHex(0xffecc8);cabinLight.emissiveIntensity=.7;
   for(const x of [22.2,23.8])box(cabinLight,x,5.34,18,.07,.025,24);
   for(const z of [8,12,16,20,24,28])for(let i=0;i<12;i++){
    const a=i/12*Math.PI,b=(i+1)/12*Math.PI;
    beam(ivory,new THREE.Vector3(23+Math.cos(a)*2.67,4.39+Math.sin(a)*1.075,z),new THREE.Vector3(23+Math.cos(b)*2.67,4.39+Math.sin(b)*1.075,z),.035);
   }
   sign('CABIN  →','#254455','#e7e1cb',12,3.55,8.74,5.5,.4,Math.PI);
   sign('FLIGHT  07','#254455','#e7e1cb',-18,5.6,-13,6,.5);
  }else if(map.architecture==='suburb'){
   for(const s of [-1,1]){
    sign(s<0?'18  /  CEDAR':'24  /  CEDAR','#ede3c8','#596b66',s*8,2.85,s*16.72,3.4,.45,s>0?Math.PI:0);
    box(steel,s*17,3.2,s*6,.11,6.4,.11);box(ivory,s*16.4,6.38,s*6,1.35,.12,.4);
    box(wood,-s*18,.75,s*22,.11,1.5,.11);box(colored(0x7d877b),-s*18,1.52,s*22,.7,.4,.48);
   }
   detailMode=true;
   for(const s of [-1,1])for(const z of [-27,-7,18,37]){
    box(colored(z>0?0x98aaa0:0xb9a486),s*43,2.8,z,10,5.6,10);
    const roof=mesh(new THREE.ConeGeometry(7.7,2.7,4),colored(0x6b7777),s*43,6.95,z);roof.rotation.y=Math.PI/4;
   }
   detailMode=false;
  }else if(map.architecture==='rig'){
   for(const sx of [-1,1])for(const sz of [-1,1]){
    beam(yellow,new THREE.Vector3(sx*2.4,6.2,4+sz*2.5),new THREE.Vector3(sx*.6,18,4+sz*.6),.2);
    for(let level=0;level<4;level++){const y=7+level*2.6,lo=2.1-level*.37,hi=1.73-level*.37;beam(steel,new THREE.Vector3(sx*lo,y,4+sz*lo),new THREE.Vector3(-sx*hi,y+2.6,4+sz*hi),.09);}
   }
   cylinder(dark,0,11,4,.045,14);cylinder(rust,0,14,4,.45,1.5);
   for(const s of [-1,1]){sign('DERRICK / 09','#655a3f','#e3cb8f',s*25,2,-35.66,8,.75);}
  }
 }
 function railing(b:Box){
  const longX=b.w>b.d,len=longX?b.w:b.d;
  box(yellow,b.x,b.y+b.h/2-.055,b.z,b.w,.11,b.d);
  box(yellow,b.x,b.y-.21,b.z,b.w,.065,b.d);
  box(yellow,b.x,b.y-b.h/2+.13,b.z,b.w,.24,b.d);
  for(let p=-len/2+.06;p<=len/2;p+=1.1)box(yellow,b.x+(longX?p:0),b.y,b.z+(longX?0:p),.095,b.h,.095);
  // Close-mesh guards visibly occupy the same volume as the rail collision.
  for(let p=-len/2+.16;p<len/2;p+=.17)box(steel,b.x+(longX?p:0),b.y+.01,b.z+(longX?0:p),.018,.72,.018);
 }
 function container(b:Box,m:THREE.Material){
  const longX=b.w>b.d;const length=longX?b.w:b.d;const inset=longX?b.d:b.w;
  for(const s of [-1,1]) {
   for(let p=-length/2+.23;p<length/2;p+=.29)box(m,b.x+(longX?p:s*(inset/2+.025)),b.y,b.z+(longX?s*(inset/2+.025):p),longX?.065:.065,b.h-.22,longX?.065:.065);
   box(dark,b.x,b.y-b.h/2+.08,b.z+s*(b.d/2+.014),b.w,.13,.042);
   box(m,b.x,b.y+b.h/2-.065,b.z+s*(b.d/2+.012),b.w,.13,.07);
   box(dark,b.x+s*(b.w/2-.055),b.y,b.z,.11,b.h,b.d+.05);
  }
  const endX=b.x+(longX?b.w/2+.026:0),endZ=b.z+(longX?0:b.d/2+.026);
  for(const s of [-1,1]) {
   box(steel,endX+(longX?0:s*.69),b.y,endZ+(longX?s*.69:0),.044,b.h-.2,.044);
   box(silverMetal,endX+(longX?.035:s*.69),b.y-.12,endZ+(longX?s*.69:.035),longX?.045:.25,.052,longX?.25:.045);
  }
  if(b.y<2) {
   if(longX)sign('DRILL / 03','#d0c5a2','#364139',b.x-.9,b.y+.12,b.z+b.d/2+.071,2.5,.65);
   else sign('LOGISTICS','#ddd0a8','#37413b',b.x+b.w/2+.071,b.y+.15,b.z,2.35,.6,Math.PI/2);
  }
 }
 // Kept here because containers use it while being populated above.
 function generator(b:Box,m:THREE.Material){
  const z=b.z+b.d/2+.018;
  box(dark,b.x,b.y-b.h/2+.09,b.z,b.w+.15,.18,b.d+.15);
  for(let i=0;i<8;i++)box(dark,b.x-b.w*.15,b.y-b.h*.17+i*b.h*.071,z,b.w*.52,.032,.025);
  box(ivory,b.x+b.w*.31,b.y+.23,z,.4,.49,.028);
  const panel=sign('DANGER','#b5a14f','#2a302b',b.x+b.w*.3,b.y+.28,z+.02,.39,.16);panel.castShadow=false;
  cylinder(dark,b.x+b.w*.35,b.y+b.h/2+.35,b.z,.062,.7);
  box(m,b.x,b.y+b.h/2+.08,b.z,b.w-.13,.16,b.d-.13);
 }
 function tank(b:Box,m:THREE.Material){
  cylinder(m,b.x,b.y,b.z,b.w/2,b.d,'z');
  for(const z of [-b.d/2+.16,b.d/2-.16]) {
   cylinder(dark,b.x,b.y,b.z+z,b.w/2+.018,.08,'z');
   box(steel,b.x,.22,b.z+z,b.w+.06,.44,.4);
   for(const x of [-1,1])box(steel,b.x+x*b.w*.43,b.y*.55,b.z+z,.17,b.y,.24);
  }
  cylinder(steel,b.x,b.y*2+.11,b.z,.35,.3);
  cylinder(dark,b.x,b.y+.2,b.z+b.d/2+.13,.28,.29,'z');
  sign('FUEL  /  03','#c0b18a','#514b37',b.x,b.y+.22,b.z+b.d/2+.025,1.5,.45);
 }

 // Housings expose readable vents, panels, fasteners, and roof profiles at close
 // range while their big silhouette remains identical to shared collision.
 function station(b:Box){
  box(ivory,b.x,b.y+b.h/2-.1,b.z,b.w+.04,.2,b.d+.04);
  box(dark,b.x,b.y-b.h/2+.12,b.z,b.w,.24,b.d+.04);
  for(const side of [-1,1]) {
   const z=b.z+side*(b.d/2+.025);
   box(dark,b.x,b.y+.65,z,b.w-.8,1.25,.05);
   for(let x=-b.w/2+.4;x<=b.w/2-.3;x+=1.3)box(steel,b.x+x,b.y+.65,z+.035*side,.08,1.35,.05);
   box(ivory,b.x,b.y-.72,z,b.w-.6,.1,.055);
   sign('RELAY / OPERATIONS','#d6ded8','#344951',b.x,b.y+1.53,z+.05*side,4.5,.4,side<0?Math.PI:0);
  }
  for(const x of [-1,1])box(steel,b.x+x*(b.w/2-.1),b.y,b.z,.2,b.h,b.d+.07);
  for(const x of [-b.w*.25,b.w*.25]) {
   box(steel,b.x+x,b.y+b.h/2+.2,b.z,1.5,.4,1.45);
   for(let n=0;n<6;n++)box(dark,b.x+x-.55+n*.22,b.y+b.h/2+.41,b.z,.09,.025,1.15);
  }
 }
 function furnace(b:Box){
  const heat=colored(0xac461d);heat.emissive.setHex(0xff5b13);heat.emissiveIntensity=2.4;heat.metalness=.05;
  for(const s of [-1,1]) {
   box(dark,b.x+s*(b.w/2-.12),b.y,b.z,.24,b.h,b.d+.08);
   box(steel,b.x,b.y+b.h/2-.35,b.z+s*(b.d/2+.04),b.w+.08,.25,.12);
   for(let i=0;i<4;i++)box(dark,b.x,b.y-b.h/2+.7+i*1.15,b.z+s*(b.d/2+.035),b.w-.4,.06,.075);
   box(dark,b.x,b.y-.35,b.z+s*(b.d/2+.06),b.w*.65,1.3,.15);
   box(heat,b.x,b.y-.48,b.z+s*(b.d/2+.14),b.w*.58,.5,.022);
   box(yellow,b.x,b.y-.35,b.z+s*(b.d/2+.16),b.w*.65,.055,.04);
   sign('HOT SURFACE','#dc9743','#2d3737',b.x,b.y+1.1,b.z+s*(b.d/2+.08),2,.4,s<0?Math.PI:0);
   for(let i=0;i<5;i++)box(rust,b.x-.9+i*.45,b.y-.35,b.z+s*(b.d/2+.15),.08,1.22,.03);
  }
  cylinder(steel,b.x,b.y+b.h/2+.15,b.z,b.w*.37,.3);
  cylinder(rust,b.x,b.y+b.h/2+2.3,b.z,.72,4.3);
  cylinder(dark,b.x,b.y+b.h/2+4.45,b.z,.88,.18);
  for(const y of [b.y+b.h/2+.8,b.y+b.h/2+3])cylinder(steel,b.x,y,b.z,.75,.13);
 }
 function relayCabinet(b:Box){
  box(ivory,b.x,b.y+b.h/2-.06,b.z,b.w+.05,.12,b.d+.05);
  for(const s of [-1,1]) {
   box(dark,b.x+s*(b.w/2-.12),b.y,b.z,.24,b.h,b.d+.06);
   for(let j=0;j<10;j++)box(steel,b.x,b.y-.85+j*.18,b.z+s*(b.d/2+.02),b.w-.6,.07,.04);
   sign('R / 07','#d7dfd8','#405b64',b.x,b.y+.95,b.z+s*(b.d/2+.05),1.6,.42,s<0?Math.PI:0);
  }
  cylinder(steel,b.x,b.y+b.h/2+.28,b.z,.65,.55);
 }
 function foundryLandmarks(){
  // An overhead gantry and twin chimney stacks frame the courtyard. Their
  // supports remain outside playable walls, so the lanes are always legible.
  for(const x of [-39,39])for(const z of [-14,14]) {
   box(concrete,x,.6,z,2.4,1.2,2.4);box(steel,x,8,z,.7,16,.7);
   beam(yellow,new THREE.Vector3(x,4,z),new THREE.Vector3(x,11,z+(z<0?5:-5)),.2);
  }
  for(const z of [-14,14]) {
   box(yellow,0,15.7,z,79,.6,.6);
   box(steel,0,14.3,z,79,.18,.18);
   for(let x=-37;x<38;x+=3.4)beam(yellow,new THREE.Vector3(x,14.3,z),new THREE.Vector3(x+3.4,15.7,z),.12);
  }
  box(steel,4,15,0,3.4,1.3,29);box(yellow,4,14.2,0,2.7,.6,2.7);
  cylinder(dark,4,10.4,0,.07,7);box(yellow,4,6.9,0,.45,.55,.6);
  for(const [x,z] of [[-43,4],[44,-6]]) {
   cylinder(concrete,x,12,z,2.4,24,'y',3.1);
   for(let y=15;y<=23;y+=2)cylinder(rust,x,y,z,2.44,.8,'y',2.44);
   cylinder(dark,x,24.1,z,2.55,.2);
  }
  for(const s of [-1,1]) {
   for(const x of [-34,-12,12,34]) {
    box(steel,x,4.4,s*36.8,.12,8.8,.12);
    box(ivory,x,8.8,s*36.8,1.2,.18,.45);
   }
   sign('F O U N D R Y','#334449','#e2d6b5',0,2.15,s*35.95,9,1,s>0?Math.PI:0);
   sign('08 / SMELTING','#3b4748','#d7a754',s*21,3.18,s>0?7.57:-7.57,5,.42,s<0?Math.PI:0);
  }
  // Inspection stripes and ribbed gallery surfaces define the walkable decks.
  for(const side of [-1,1])for(let z=-7;z<=7;z+=.42)box(dark,side*21,3.612,z,7.6,.024,.025);
 }
 function relayLandmarks(){
  const dishMaterial=mat(0xc9d9d9,.48,.48);dishMaterial.side=THREE.DoubleSide;
  function dish(x:number,y:number,z:number,r:number,rotation:number){
   const curve=[new THREE.Vector2(.06,0),new THREE.Vector2(r*.25,r*.025),new THREE.Vector2(r*.5,r*.12),new THREE.Vector2(r*.75,r*.29),new THREE.Vector2(r,r*.5)];
   const dish=mesh(new THREE.LatheGeometry(curve,24),dishMaterial,x,y,z);dish.rotation.set(.85,rotation,.25);
   cylinder(steel,x,y-1.5,z,.25,3);
   beam(steel,new THREE.Vector3(x,y,z),new THREE.Vector3(x+.8,y+1.8,z+1.3),.1);
   cylinder(dark,x+.8,y+1.8,z+1.3,.15,.42);
  }
  // Playable antenna decks use only small roof-height components; the large
  // dishes sit outside the perimeter and create an unmistakable skyline.
  for(const s of [-1,1]) {
   dish(s*44,7,-s*19,5.8,s*.55);
   dish(s*23,6.3,0,1.65,s*.55);
   for(let y=5.1;y<13;y+=2.1){box(ivory,0,y,0,1.3,.25,1.3);}
   box(steel,s*.72,9.7,0,.5,2.3,.28);box(ivory,s*.9,9.7,0,.16,2.15,.65);
   sign('RELAY STATION / 07','#3d5660','#dfe8df',0,2.1,s*37.95,9,1,s>0?Math.PI:0);
   for(const x of [-30,30]){box(steel,x,3.6,s*34,.12,7.2,.12);box(ivory,x,7.2,s*34,.8,.17,.6);}
  }
  cylinder(ivory,0,13.7,0,.13,7);cylinder(yellow,0,17.25,0,.2,.2);
  for(const x of [-1,1])for(const z of [-1,1])beam(steel,new THREE.Vector3(x*.6,4,z*.6),new THREE.Vector3(x*.25,12,z*.25),.08);
 }
 function arenaSurface(){
  const roadMap=surfaceTexture('asphalt');
  const paint=mat(map.id==='relay'?0xb1c3bc:0xc8b897,.95,0),asphalt=mat(0xd9dde0,1,0,roadMap);asphalt.bumpMap=roadMap;asphalt.bumpScale=.018;
  const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=128;const context=contactCanvas.getContext('2d')!;
  const gradient=context.createRadialGradient(64,64,12,64,64,64);gradient.addColorStop(0,'rgba(12,20,18,.48)');gradient.addColorStop(.6,'rgba(12,20,18,.26)');gradient.addColorStop(1,'rgba(12,20,18,0)');context.fillStyle=gradient;context.fillRect(0,0,128,128);
  const contactTexture=new THREE.CanvasTexture(contactCanvas);textures.push(contactTexture);
  const contact=new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});mats.push(contact);

  // Flush road strips, expansion seams, and tire marks add detail at effectively
  // no geometry cost. No decorative object intrudes into a movement route.
  const half=map.size/2;
  if(map.footprint){
   if(map.architecture==='suburb'){
    const grass=mat(0xffffff,1,0,surfaceTexture('grass')),street=asphalt;
    for(const region of map.footprint)box(grass,region.x,-.012,region.z,region.w-.2,.02,region.d-.2);
    box(street,0,.002,0,15,.015,78);
    for(const s of [-1,1]){box(concrete,s*8,.012,0,1,.015,78);box(concrete,s*14,.012,s*25,12,.015,3);}
   }else if(map.architecture==='airport'){
    const tile=mat(0xf2f2ed,.54,0,surfaceTexture('terrazzo')),apron=asphalt;
    box(tile,-18,-.012,-6,39.8,.02,79.8);box(apron,21,-.012,19,37.8,.02,29.8);
    for(let z=-44;z<33;z+=3)box(colored(0xa4afaf),-18,.003,z,39,.008,.017);
    for(let x=-35;x<2;x+=3)box(colored(0xa4afaf),x,.003,-6,.017,.008,79);
    for(let z=-43;z<30;z+=4)box(yellow,-18,.013,z,.12,.018,1.5);
    for(const x of [10,18,26,34])box(yellow,x,.011,19,.1,.02,25);
   }else{
    const gravel=mat(0xffffff,1,0,groundMap);for(const region of map.footprint)box(gravel,region.x,-.012,region.z,region.w-.2,.02,region.d-.2);
    box(asphalt,0,.002,5,5.5,.015,65);
    for(const x of [-3,3])for(let z=-33;z<36;z+=3)box(paint,x,.014,z,.12,.018,1.4);
   }
  } else {
  for(const x of [-half*.48,half*.48]) {
   box(asphalt,x,-.006,0,map.id==='yard'?5:6,.02,map.size-2);
   for(const s of [-1,1])for(let z=-half+2;z<half-2;z+=3.8)box(paint,x+s*2.5,.007,z,.1,.015,1.7);
  }
  const seam=mat(map.id==='yard'?0x998d72:map.id==='foundry'?0x7b8990:0x7d8c88,1,0);
  for(let line=-half+4;line<half;line+=6)box(seam,line,-.003,0,.017,.01,map.size);
  for(let line=-half+4;line<half;line+=6)box(seam,0,-.003,line,map.size,.01,.017);
  }
  for(const [team,color] of [['red',0xa75443],['blue',0x4c8294]] as const) {
   const base=map.flagBases[team],m=mat(color,.83,.12);
   const ring=mesh(new THREE.RingGeometry(1.65,1.83,40),m,base.x,.017,base.z);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
   for(const x of [-1,1])box(m,base.x+x*3.2,.018,base.z,.16,.024,4.5);
   const side=team==='red'?-1:1;
   const label=sign(team==='red'?'01 / NORTH':'02 / SOUTH','#394c4d','#cbd4c3',base.x,.023,base.z+side*3.1,3,.6);label.rotation.x=-Math.PI/2;label.castShadow=false;
  }
  // Equipment pads, footings, and warning edges anchor large masses visually.
  for(const b of map.boxes) {
   if(!['generator','furnace','relay','station','container','crate','barrier','barrel','tank'].includes(b.kind)||b.y-b.h/2>.2)continue;
   const edge=['crate','barrier','barrel','tank'].includes(b.kind)?.65:1.5;
   const shadow=mesh(new THREE.PlaneGeometry(b.w+edge,b.d+edge),contact,b.x,.025,b.z);shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;
   if(['crate','barrier','barrel','tank'].includes(b.kind))continue;
   box(concrete,b.x,-.003,b.z,b.w+.65,.04,b.d+.65);
   for(const s of [-1,1])box(paint,b.x+s*(b.w/2+.24),.019,b.z,.055,.022,b.d+.4);
  }
 }
 if(map.id==='yard') {
 // Open steel derrick. Its narrowing silhouette is visible from every lane.
 for(const x of [-1,1])for(const z of [-1,1]) {
  beam(yellow,new THREE.Vector3(x*2.1,6.6,z*2.3),new THREE.Vector3(x*.65,17.4,z*.65),.19);
  for(let l=0;l<4;l++) {
   const y=7.3+l*2.48,lo=2.03-l*.33,hi=1.7-l*.33;
   beam(steel,new THREE.Vector3(x*lo,y,z*lo),new THREE.Vector3(-x*hi,y+2.48,z*hi),.07);
  }
 }
 for(let l=0;l<5;l++) {
  const y=7.3+l*2.48,r=2.03-l*.33;
  for(const s of [-1,1]) {box(yellow,s*r,y,0,.115,.15,r*2);box(yellow,0,y,s*r,r*2,.15,.115);}
 }
 box(steel,0,17.6,0,1.7,.3,1.7);cylinder(dark,0,17.96,0,.37,.4);cylinder(steel,0,11.3,0,.038,12.7);
 cylinder(rust,0,14.45,0,.39,1.8);cylinder(dark,0,15.6,0,.6,.31);
 for(const x of [-.42,.42])box(yellow,x,6.72,-1.83,.1,.23,1.2);
 // Diagonal under-deck bracing, base pads, and hazard edges.
 for(const s of [-1,1]) {
  beam(steel,new THREE.Vector3(s*3.6,.15,-3.6),new THREE.Vector3(s*3.6,2.95,1.5),.12);
  beam(steel,new THREE.Vector3(-3.6,.15,s*3.6),new THREE.Vector3(1.3,2.95,s*3.6),.12);
  box(yellow,0,3.08,s*4.22,8.45,.16,.07);box(yellow,s*4.22,3.08,0,.07,.16,8.45);
  box(yellow,1,6.38,s*3.91,5.8,.14,.06);
 }
 for(const x of [-3.6,3.6])for(const z of [-3.6,3.6]){box(concrete,x,.11,z,.88,.22,.88);for(const dx of [-.28,.28])for(const dz of [-.28,.28])box(dark,x+dx,.235,z+dz,.065,.045,.065);}
 for(let i=0;i<11;i++) {
  box(yellow,2.8,(i+1)*.3+.012,10.7-i*.65+.31,1.75,.025,.065);
  box(yellow,-2.8,3.3+(i+1)*.3+.012,3.4-i*.65+.31,1.5,.025,.065);
 }
 // Stair handrail follows the climb, with useful visual direction to the decks.
 for(const x of [1.88,3.72]){
  beam(yellow,new THREE.Vector3(x,1.25,10.9),new THREE.Vector3(x,4.28,4),.066);
  for(let i=0;i<6;i++)box(yellow,x,.8+i*.6,10.7-i*1.3,.065,1,.065);
 }
 sign('03','#b59d5c','#292f26',0,2.27,4.01,1.8,1.15);
 sign('NO SMOKING','#5b4f3d','#e1d6b6',-14.5,2.25,28.97,3.7,.7,Math.PI);
 sign('DUSTLINE · DRILL SITE','#435044','#e5d7ab',0,2.12,-28.97,8,1.22);
 sign('RESTRICTED AREA','#ad8543','#2c3027',28.97,2.08,-13,4,.75,-Math.PI/2);
 // Ground-level pipe racks. These are outside the central circulation routes.
 for(const x of [-1,1]) {
  for(let i=0;i<3;i++) {
   cylinder(steel,x*23.8,1.05+i*.59,3.6*x,.305,.14,'z');
   cylinder(steel,x*23.8,1.05+i*.59,11.8*x,.305,.14,'z');
  }
  for(const z of [4*x,11*x]){box(steel,x*23.8,.43,z,1.15,.85,.15);box(steel,x*23.8,1.93,z,1.15,.11,.15);}
 }
 // A raised utility crossing frames the tank lane without obstructing players.
 for(const x of [-14,-7])box(concrete,x,.15,8.6,.65,.3,.65);
 box(yellow,-10.5,6.48,8.6,7.2,.17,.22);
 cylinder(steel,-10.5,6.15,8.6,.24,7.5,'x');
 } else if(map.id==='foundry') foundryLandmarks();
 else {switch(map.id){case 'relay':relayLandmarks();break;case 'airfield':case 'homestead':case 'derrick':originalLandmarks();break;default:sign(map.name.toUpperCase(),'#394c4d','#e2ddc7',0,2.2,-map.size/2+.04,9,1.2);}}
 arenaSurface();
 detailMode=true;
 // Exterior industry, terrain, and distant mountain ridges close the horizon.
 // Connected, irregular ridges and worn plateaus avoid repeated cone silhouettes.
 const rockMaterial=new THREE.MeshStandardMaterial({color:map.id==='relay'?0x8f9f99:map.id==='foundry'?0x8c9ca6:0xc4ad89,roughness:1,vertexColors:true,flatShading:true});mats.push(rockMaterial);
 function terrain(positions:number[],indices:number[],colors:number[]) {
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
  const out=mesh(geo,rockMaterial,0,0,0);out.castShadow=false;return out;
 }
 const terrainStart=sceneryInnerRadius(map);
 const ridgeSegments=80,ridgeRadii=[0,15,32,47,72,95].map(r=>r+terrainStart),ridgeProfile=[0,.21,.68,1,.4,0];
 const ridgeHeights=Array.from({length:ridgeSegments},(_,i)=>{const a=i/ridgeSegments*Math.PI*2;return 17+7*Math.sin(a*3+.4)+5*Math.sin(a*7+1.6)+3*Math.sin(a*13)+rand()*5;});
 const ridgePos:number[]=[],ridgeIndices:number[]=[],ridgeColors:number[]=[];
 for(let r=0;r<ridgeRadii.length;r++)for(let i=0;i<ridgeSegments;i++) {
  const a=i/ridgeSegments*Math.PI*2,rad=ridgeRadii[r]+(rand()-.5)*8,angularShift=(rand()-.5)*.023;
  const height=-3+ridgeHeights[i]*ridgeProfile[r]+(r>0&&r<5?(rand()-.5)*3:0);
  ridgePos.push(Math.cos(a+angularShift)*rad,height,Math.sin(a+angularShift)*rad);
  const tone=.81+rand()*.17+r*.012;ridgeColors.push(tone,tone*.963,tone*.895);
 }
 for(let r=0;r<ridgeRadii.length-1;r++)for(let i=0;i<ridgeSegments;i++) {
  const next=(i+1)%ridgeSegments,a=r*ridgeSegments+i,b=r*ridgeSegments+next,c=(r+1)*ridgeSegments+i,d=(r+1)*ridgeSegments+next;
  ridgeIndices.push(a,b,c,b,d,c);
 }
 terrain(ridgePos,ridgeIndices,ridgeColors);
 // Each mesa has an offset plateau and layered cliff shoulders, never one apex.
 for(let k=0;k<7;k++) {
  const a=k/7*Math.PI*2+.17,r=terrainStart+47+rand()*16,cx=Math.cos(a)*r,cz=Math.sin(a)*r;
  const w=15+rand()*11,d=11+rand()*7,h=16+rand()*13,n=13,offsetX=(rand()-.5)*w*.6,offsetZ=(rand()-.5)*d*.5;
  const outline=Array.from({length:n},()=>.79+rand()*.3),topHeights=Array.from({length:n},()=>h+(rand()-.5)*2.3);
  const positions:number[]=[],indices:number[]=[],colors:number[]=[],profiles=[1,.76,.55,.46],ys=[-3,h*.45,h*.93,h];
  for(let layer=0;layer<4;layer++)for(let j=0;j<n;j++) {
   const angle=j/n*Math.PI*2,scale=outline[j]*profiles[layer];
   positions.push(cx+Math.cos(angle)*w*scale+offsetX*layer/3,layer===3?topHeights[j]:ys[layer]+(rand()-.5)*1.6,cz+Math.sin(angle)*d*scale+offsetZ*layer/3);
   const shade=[.82,.93,.8,1.04][layer]+rand()*.1;colors.push(shade,shade*.965,shade*.89);
  }
  for(let layer=0;layer<3;layer++)for(let j=0;j<n;j++) {const a=layer*n+j,b=layer*n+(j+1)%n,c=(layer+1)*n+j,d=(layer+1)*n+(j+1)%n;indices.push(a,c,b,b,c,d);}
  const center=positions.length/3;positions.push(cx+offsetX,h-.3,cz+offsetZ);colors.push(1.03,.99,.92);
  for(let j=0;j<n;j++)indices.push(center,3*n+(j+1)%n,3*n+j);
  terrain(positions,indices,colors);
 }
 if(!map.architecture||map.architecture==='rig')for(const [offset,z] of [[-43,-22],[-48,-35],[42,27],[45,39]]) {
  const x=Math.sign(offset)*(map.size/2+10+Math.abs(offset)-42);
  cylinder(ivory,x,5,z,5,10);cylinder(steel,x,10.06,z,5.06,.17);
  cylinder(rust,x,11,z,1.04,1.85);
  for(const s of [-1,1])box(steel,x+s*5.03,6,z,.13,8,.13);
 }
 if(!map.architecture||map.architecture==='rig')for(const [offset,z] of [[43,-39],[-41,36]]) {
  const x=Math.sign(offset)*(map.size/2+10);
  for(const sx of [-1,1])for(const sz of [-1,1])beam(rust,new THREE.Vector3(x+sx*3,0,z+sz*3),new THREE.Vector3(x+sx*.8,23,z+sz*.8),.24);
  for(let y=5;y<=23;y+=4.5){const r=3-y*.095;for(const s of [-1,1]){box(steel,x+s*r,y,z,.16,.15,r*2);box(steel,x,y,z+s*r,r*2,.15,.16);}}
  box(dark,x,24,z,2.1,.7,2.1);cylinder(rust,x,28,z,.17,8);
 }
 // Rocks, loose cables, and small scrub stay near solids so paths read clearly.
 for(let i=0;i<95;i++) {
  const x=(rand()-.5)*(map.size-1),z=(rand()-.5)*(map.size-1);
  if(!containsMapPosition(map,x,z,.5))continue;
  if(Math.abs(x)<map.size/2-3&&Math.abs(z)<map.size/2-3&&rand()>.26)continue;
  const rock=mesh(new THREE.DodecahedronGeometry(.08+rand()*.23,0),dustMat,x,.06,z);rock.scale.set(1.6,.45,1);rock.rotation.set(rand(),rand(),rand());rock.castShadow=false;
 }
 for(const [x,z] of [[-24,-25],[25,-15],[25,23],[-23,23],[-26,4],[5,-26]]) {
  for(let i=0;i<4;i++)beam(dustMat,new THREE.Vector3(x,0,z),new THREE.Vector3(x+(rand()-.5)*.65,.3+rand()*.35,z+(rand()-.5)*.65),.017);
 }
 detailMode=false;
 // Mount the decorative banner on the perimeter wall in every arena.
 const flagGeo=new THREE.PlaneGeometry(1.55,.8,12,5);geos.push(flagGeo);
 const flagMat=mat(0xd1b361,1,0);flagMat.side=THREE.DoubleSide;
 const flag=new THREE.Mesh(flagGeo,flagMat);const bannerPoint=map.outline?.[0]??{x:0,z:-map.size/2};flag.position.set(bannerPoint.x+1.7,6.1,bannerPoint.z-.1);flag.rotation.y=.12;root.add(flag);box(steel,bannerPoint.x+.94,5.42,bannerPoint.z-.1,.054,3.25,.054);
 const originalFlag=new Float32Array(flagGeo.attributes.position.array as Float32Array);
 // Fine drifting particles use one draw call and remain deliberately subtle.
 const dustGeo=new THREE.BufferGeometry();geos.push(dustGeo);const dustCount=105;const dustPositions=new Float32Array(dustCount*3);
 for(let i=0;i<dustCount;i++){dustPositions[i*3]=(rand()-.5)*map.size;dustPositions[i*3+1]=.15+rand()*8;dustPositions[i*3+2]=(rand()-.5)*map.size;}
 dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));const pointsMaterial=new THREE.PointsMaterial({color:0xf3dec0,size:.06,transparent:true,opacity:.37,depthWrite:false});mats.push(pointsMaterial);
 const particles=new THREE.Points(dustGeo,pointsMaterial);root.add(particles);
 for(const [batchMap,parent] of [[batches,root],[detailBatches,decoration]] as const)for(const [m,transforms] of batchMap) {
  const instanced=new THREE.InstancedMesh(unitBox,m,transforms.length);transforms.forEach((t,i)=>instanced.setMatrixAt(i,t));instanced.castShadow=true;instanced.receiveShadow=true;instanced.computeBoundingSphere();parent.add(instanced);
 }
 // Merge static non-instanced details by material. Cylinders, signs, and the
 // distant terrain cost a handful of draws rather than hundreds of small draws.
 for(const parent of [root,decoration]){
 const staticBatches=new Map<THREE.Material,THREE.Mesh[]>();
 for(const child of [...parent.children])if(child instanceof THREE.Mesh&&!(child instanceof THREE.InstancedMesh)&&child!==flag&&!Array.isArray(child.material)){
  if(!staticBatches.has(child.material))staticBatches.set(child.material,[]);staticBatches.get(child.material)!.push(child);
 }
 for(const [material,parts] of staticBatches){
  if(parts.length<2)continue;
  const copies=parts.map(part=>{part.updateMatrix();const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();return geometry.applyMatrix4(part.matrix);});
  const merged=mergeGeometries(copies,false);copies.forEach(geometry=>geometry.dispose());
  if(!merged)continue;geos.push(merged);const batch=new THREE.Mesh(merged,material);batch.castShadow=parts.some(part=>part.castShadow);batch.receiveShadow=true;parent.add(batch);parts.forEach(part=>parent.remove(part));
 }
 }
 // The shared Blender kit is loaded once for arms, boots and environment.
 // Each authored material is a single draw per prop kind, regardless of count.
 void loadAssetKit().then(kit=>{
  if(disposed)return;
  kit.updateMatrixWorld(true);
  const surfaceMaterials=new Map<THREE.Material,THREE.Material>();
  // Authored cast meshes can have no meaningful UVs. Derive a local projection
  // once for those surfaces, leaving the shared viewmodel geometry untouched.
  const surfaceGeometry=(original:THREE.BufferGeometry)=>{
   const uv=original.getAttribute('uv');let mapped=false;
   if(uv)for(let i=1;i<uv.count;i++)if(Math.abs(uv.getX(i)-uv.getX(0))+Math.abs(uv.getY(i)-uv.getY(0))>.001){mapped=true;break;}
   if(mapped)return original;
   const geometry=original.clone(),positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),coords=new Float32Array(positions.count*2);
   for(let i=0;i<positions.count;i++){
    const nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i)),nz=Math.abs(normals.getZ(i));
    coords[i*2]=(nx>ny&&nx>nz?positions.getZ(i):positions.getX(i))*1.4;
    coords[i*2+1]=(ny>nx&&ny>nz?positions.getZ(i):positions.getY(i))*1.4;
   }
   geometry.setAttribute('uv',new THREE.BufferAttribute(coords,2));geometry.userData.shared=false;geos.push(geometry);return geometry;
  };

  const surfaceMaterial=(original:THREE.Material)=>{
   const existing=surfaceMaterials.get(original);if(existing)return existing;
   if(!(original instanceof THREE.MeshStandardMaterial))return original;
   const material=original.clone();material.userData.shared=false;
   const isWood=/plywood/i.test(original.name),isConcrete=/concrete/i.test(original.name);
   material.map=isWood?woodMap:isConcrete?concreteMap:metalMap;
   material.bumpMap=material.map;material.bumpScale=isWood?.018:isConcrete?.028:.009;
   if(map.id!=='yard'&&/powder coat/i.test(original.name))material.color.setHex(map.id==='relay'?0x5d7782:0x62717d);
   tileWorldMaterial(material);material.metalness=Math.min(material.metalness,.45);material.needsUpdate=true;mats.push(material);surfaceMaterials.set(original,material);return material;
  };
  for(const kind of ['crate','barrier','barrel'] as const){
   const slots=propSlots.filter(slot=>slot.kind===kind),source=kit.getObjectByName(kind);
   if(!slots.length||!source)continue;
   source.updateWorldMatrix(true,true);
   const bounds=new THREE.Box3().setFromObject(source),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   if(Math.min(size.x,size.y,size.z)<=0)continue;
   const parts:THREE.Mesh[]=[];source.traverse(node=>{if(node instanceof THREE.Mesh)parts.push(node);});
   for(const part of parts){
    const instances=new THREE.InstancedMesh(surfaceGeometry(part.geometry),Array.isArray(part.material)?part.material.map(surfaceMaterial):surfaceMaterial(part.material),slots.length);
    const normalization=new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z);
    slots.forEach((slot,i)=>{
     const b=slot.box,turn=kind==='barrier'&&b.d>b.w;
     const transform=new THREE.Matrix4().makeTranslation(b.x,b.y-b.h/2,b.z)
      .multiply(new THREE.Matrix4().makeRotationY(turn?Math.PI/2:0))
      .multiply(new THREE.Matrix4().makeScale((turn?b.d:b.w)/size.x,b.h/size.y,(turn?b.w:b.d)/size.z))
      .multiply(normalization).multiply(part.matrixWorld);
     instances.setMatrixAt(i,transform);
    });
    instances.castShadow=true;instances.receiveShadow=true;instances.computeBoundingSphere();root.add(instances);instances.updateMatrix();instances.matrixAutoUpdate=false;
   }
   for(const slot of slots)slot.root.visible=false;
  }
  qualityMaterials();
 }).catch(()=>{/* Procedural collision-sized fallbacks stay usable offline. */});
 // These transforms never change; flag and dust animate vertex buffers only.
 root.traverse(node=>{node.updateMatrix();node.matrixAutoUpdate=false;});
 const bumpMaps=new Map<THREE.MeshStandardMaterial,THREE.Texture>();
 function qualityMaterials(){for(const material of mats){
  if(!(material instanceof THREE.MeshStandardMaterial))continue;
  if(material.bumpMap&&!bumpMaps.has(material))bumpMaps.set(material,material.bumpMap);
  const next=quality==='high'?(bumpMaps.get(material)??null):null;
  if(material.bumpMap!==next){material.bumpMap=next;material.needsUpdate=true;}
 }}
 let previous=0;
 return {root,map,propSlots,lighting,
  setQuality(value){quality=value;decoration.visible=value==='high';particles.visible=value==='high';flag.visible=value==='high';qualityMaterials();},
  update(time:number){
   const dt=previous?Math.min(.05,time-previous):0;previous=time;
   if(quality==='low')return;
   const pos=flagGeo.attributes.position as THREE.BufferAttribute;
   for(let i=0;i<pos.count;i++){const x=originalFlag[i*3];pos.setZ(i,Math.sin(x*5-time*3.2+originalFlag[i*3+1]*2)*.1*(x+.78));}pos.needsUpdate=true;flagGeo.computeVertexNormals();
   for(let i=0;i<dustCount;i++){dustPositions[i*3]+=dt*(.22+(i%7)*.032);dustPositions[i*3+1]+=Math.sin(time*.8+i)*dt*.025;if(dustPositions[i*3]>map.size/2)dustPositions[i*3]=-map.size/2;}dustGeo.attributes.position.needsUpdate=true;
  },
  dispose(){disposed=true;scene.remove(root);lighting.dispose();root.traverse(node=>{if(node instanceof THREE.InstancedMesh)node.dispose();});for(const g of new Set(geos))g.dispose();for(const m of new Set(mats))m.dispose();for(const t of textures)t.dispose();}
 };
}
