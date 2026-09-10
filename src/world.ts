import * as THREE from 'three';
import { getMap, type MapDefinition } from '../shared/map';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Box } from '../shared/types';
import { loadAssetKit } from './assets';
import { createWorldLighting, type WorldLighting } from './lighting';

export interface WorldPropSlot { kind: 'crate' | 'barrier' | 'barrel'; box: Box; root: THREE.Group }
/** Static architecture is instanced/merged; only dust and a small flag animate. */
export function buildWorld(scene:THREE.Scene,map:MapDefinition=getMap('yard')):{root:THREE.Group;map:MapDefinition;propSlots:WorldPropSlot[];lighting:WorldLighting;update(time:number):void;dispose():void} {
 const propSlots:WorldPropSlot[]=[];let disposed=false;
 const root=new THREE.Group();root.name=`Dustline / ${map.name}`;scene.add(root);
 const lighting=createWorldLighting(scene,map);
 const mats:THREE.Material[]=[];const textures:THREE.Texture[]=[];const geos:THREE.BufferGeometry[]=[];
 const mat=(color:number,roughness=.83,metalness=.05,map?:THREE.Texture)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness,...(map?{map}:{})});mats.push(m);return m;};
 let seed=map.id==='yard'?81723:map.id==='foundry'?17294:51637;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const texture=(kind:'sand'|'metal'|'concrete'|'wood')=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d')!;
  c.fillStyle=kind==='sand'?'#c0ad87':kind==='metal'?'#c5c8c9':kind==='wood'?'#d0cbc2':'#c8ccce';c.fillRect(0,0,512,512);
  for(let i=0;i<20000;i++){const light=rand()>.52;c.fillStyle=light?'rgba(255,250,224,.065)':'rgba(36,30,21,.045)';const r=kind==='metal'?rand()*2:rand()*3;c.fillRect(rand()*512,rand()*512,r,r);}
  // Layers at several scales survive both close inspection and distance mipmaps.
  if(kind==='concrete'||kind==='sand') {
   for(let i=0;i<1400;i++) {
    const shade=rand()>.5?'255,250,236':'36,39,33';c.fillStyle=`rgba(${shade},${.035+rand()*.065})`;
    c.beginPath();c.ellipse(rand()*512,rand()*512,1+rand()*15,1+rand()*8,rand()*Math.PI,0,Math.PI*2);c.fill();
   }
   for(let i=0;i<8000;i++){c.fillStyle=rand()>.7?'rgba(232,228,207,.2)':'rgba(33,39,34,.15)';c.fillRect(rand()*512,rand()*512,.5+rand()*1.5,.5+rand()*1.5);}
  }
  if(kind==='concrete')for(let i=0;i<7;i++) {
   let x=rand()*512,y=rand()*512;c.strokeStyle='rgba(44,47,42,.13)';c.lineWidth=.6;c.beginPath();c.moveTo(x,y);
   for(let n=0;n<5;n++){x+=(rand()-.5)*22;y+=5+rand()*13;c.lineTo(x,y);}c.stroke();
  }
  if(kind==='sand')for(let i=0;i<160;i++){c.strokeStyle='rgba(137,105,65,.06)';c.lineWidth=rand()*2+1;c.beginPath();const x=rand()*512,y=rand()*512;c.moveTo(x,y);c.bezierCurveTo(x+16,y-3,x+26,y+5,x+60,y+2);c.stroke();}
  if(kind==='metal'){
   for(let i=0;i<60;i++){const x=rand()*512;c.strokeStyle='rgba(46,51,52,.09)';c.lineWidth=.5+rand()*3;c.beginPath();c.moveTo(x,0);c.lineTo(x+rand()*2,512);c.stroke();}
   // Dull chips, corrosion blooms and rubbed edges stay subtle at distance.
   for(let i=0;i<240;i++){const x=rand()*512,y=rand()*512;c.fillStyle='rgba(83,62,46,.055)';c.fillRect(x,y,rand()*8+1,rand()*18+1);c.fillStyle='rgba(239,240,225,.10)';c.fillRect(x-1,y-1,rand()*4+1,1);}
  }
  if(kind==='wood'){
   for(let i=0;i<260;i++){const y=rand()*512;c.strokeStyle=rand()>.4?'rgba(71,57,40,.12)':'rgba(253,244,215,.16)';c.lineWidth=.6+rand()*2;c.beginPath();c.moveTo(0,y);c.bezierCurveTo(128,y+(rand()-.5)*22,360,y+(rand()-.5)*12,512,y);c.stroke();}
   for(let i=0;i<6;i++){const x=rand()*512,y=rand()*512;c.strokeStyle='rgba(80,57,36,.12)';for(let r=1;r<4;r++){c.beginPath();c.ellipse(x,y,r*12,r*2,.07,0,Math.PI*2);c.stroke();}}
  }
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='sand'?12:1,kind==='sand'?12:1);t.anisotropy=8;textures.push(t);return t;
 };
 const metalMap=texture('metal'),concreteMap=texture('concrete'),woodMap=texture('wood');
 const groundMap=texture(map.id==='yard'?'sand':'concrete');groundMap.repeat.set(56,56);
 const sand=mat(map.theme.ground,1,0,groundMap),steel=mat(map.theme.steel,.74,.57,metalMap),yellow=mat(map.theme.accent,.68,.4,metalMap);
 const concrete=mat(map.id==='yard'?0xb5ad93:0x9ba6ab,.96,0,concreteMap),dark=mat(map.id==='yard'?0x2e352f:0x3c4e59,.76,.22,metalMap),rust=mat(0x794b31,.87,.35,metalMap),wood=mat(0x86754f,.98,0,woodMap);
 sand.bumpMap=groundMap;sand.bumpScale=.035;concrete.bumpMap=concreteMap;concrete.bumpScale=.035;steel.bumpMap=metalMap;steel.bumpScale=.009;wood.bumpMap=woodMap;wood.bumpScale=.013;
 const silverMetal=mat(0x99998c,.45,.75);
 const blue=mat(0x496465,.84,.22,metalMap),dustMat=mat(0x8c7755,1,0),ivory=mat(map.id==='yard'?0xd4c9a5:0xc4d1d5,.85,.15,metalMap);
 const cache=new Map<number,THREE.MeshStandardMaterial>();
 const signCache=new Map<string,THREE.MeshStandardMaterial>();
 const colored=(color:number)=>{if(!cache.has(color)){const m=mat(color,.81,.2,metalMap);m.bumpMap=metalMap;m.bumpScale=.014;cache.set(color,m);}return cache.get(color)!;};
 const unitBox=new THREE.BoxGeometry(1,1,1);geos.push(unitBox);
 // Batch repeated architecture by material to leave frame time for the game.
 const batches=new Map<THREE.Material,THREE.Matrix4[]>();const dummy=new THREE.Object3D();
 function box(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,ry=0){dummy.position.set(x,y,z);dummy.rotation.set(0,ry,0);dummy.scale.set(w,h,d);dummy.updateMatrix();if(!batches.has(m))batches.set(m,[]);batches.get(m)!.push(dummy.matrix.clone());}
 function mesh(geo:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number){geos.push(geo);const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;root.add(o);return o;}
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
  const m=b.color?colored(b.color):b.kind==='boundary'||b.kind==='wall'||b.kind==='plinth'?concrete:b.kind==='deck'||b.kind==='stairs'?steel:b.kind==='rail'?yellow:b.kind==='crate'?wood:b.kind==='steel'?yellow:b.kind==='barrier'?concrete:steel;
  if(b.kind==='pipe') {cylinder(rust,b.x,b.y,b.z,b.w/2,b.d,'z');continue;}
  if(b.kind==='tank') {tank(b,m);continue;}
  if(b.kind==='rail') {railing(b);continue;}
  if(b.kind==='crate'||b.kind==='barrier'||b.kind==='barrel') {
   const slot=new THREE.Group();slot.name=`${b.kind} asset slot`;root.add(slot);
   const fallback=new THREE.Mesh(unitBox,m);fallback.position.set(b.x,b.y,b.z);fallback.scale.set(b.w,b.h,b.d);fallback.castShadow=true;fallback.receiveShadow=true;slot.add(fallback);propSlots.push({kind:b.kind,box:b,root:slot});
  } else box(m,b.x,b.y,b.z,b.w,b.h,b.d);
  if(b.kind==='container')container(b,m);
  if(b.kind==='generator'||b.kind==='console')generator(b,m);
  if(b.kind==='station')station(b);
  if(b.kind==='furnace')furnace(b);
  if(b.kind==='relay')relayCabinet(b);
  if(b.kind==='stairs')box(yellow,b.x,b.y+b.h/2+.009,b.z+b.d/2-.025,b.w,.018,.055);
  if(b.kind==='boundary') {
   const alongX=b.w>b.d;const length=alongX?b.w:b.d;
   for(let n=-length/2+1;n<length/2;n+=3){box(steel,b.x+(alongX?n:0),4.55,b.z+(alongX?0:n),.1,2.5,.1);}
   box(rust,b.x,4.1,b.z,alongX?length:.055,.04,alongX?.055:length);
   box(rust,b.x,5.65,b.z,alongX?length:.055,.04,alongX?.055:length);
   // Corrugated mesh fencing provides a readable limit and a industrial skyline.
   for(let n=-length/2;n<length/2;n+=.35)box(rust,b.x+(alongX?n:0),4.7,b.z+(alongX?0:n),.02,1.9,.02);
   for(let n=-length/2+2;n<length/2;n+=5)box(concrete,b.x+(alongX?n:0),1.72,b.z+(alongX?0:n),alongX?.15:b.w+.05,3.44,alongX?b.d+.05:.15);
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
  const roadMap=texture('concrete');roadMap.repeat.set(2,12);
  const paint=mat(map.id==='relay'?0xb1c3bc:0xc8b897,.95,0),asphalt=mat(map.id==='yard'?0x9d947d:map.id==='foundry'?0x536572:0x677876,1,0,roadMap);asphalt.bumpMap=roadMap;asphalt.bumpScale=.018;
  const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=128;const context=contactCanvas.getContext('2d')!;
  const gradient=context.createRadialGradient(64,64,12,64,64,64);gradient.addColorStop(0,'rgba(12,20,18,.48)');gradient.addColorStop(.6,'rgba(12,20,18,.26)');gradient.addColorStop(1,'rgba(12,20,18,0)');context.fillStyle=gradient;context.fillRect(0,0,128,128);
  const contactTexture=new THREE.CanvasTexture(contactCanvas);textures.push(contactTexture);
  const contact=new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});mats.push(contact);

  // Flush road strips, expansion seams, and tire marks add detail at effectively
  // no geometry cost. No decorative object intrudes into a movement route.
  const half=map.size/2;
  for(const x of [-half*.48,half*.48]) {
   box(asphalt,x,-.006,0,map.id==='yard'?5:6,.02,map.size-2);
   for(const s of [-1,1])for(let z=-half+2;z<half-2;z+=3.8)box(paint,x+s*2.5,.007,z,.1,.015,1.7);
  }
  const seam=mat(map.id==='yard'?0x998d72:map.id==='foundry'?0x7b8990:0x7d8c88,1,0);
  for(let line=-half+4;line<half;line+=6)box(seam,line,-.003,0,.017,.01,map.size);
  for(let line=-half+4;line<half;line+=6)box(seam,0,-.003,line,map.size,.01,.017);
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
 else {switch(map.id){case 'relay':relayLandmarks();break;default:sign(map.name.toUpperCase(),'#394c4d','#e2ddc7',0,2.2,-map.size/2+.04,9,1.2);}}
 arenaSurface();
 // Exterior industry, terrain, and distant mountain ridges close the horizon.
 // Connected, irregular ridges and worn plateaus avoid repeated cone silhouettes.
 const rockMaterial=new THREE.MeshStandardMaterial({color:map.id==='relay'?0x8f9f99:map.id==='foundry'?0x8c9ca6:0xc4ad89,roughness:1,vertexColors:true,flatShading:true});mats.push(rockMaterial);
 function terrain(positions:number[],indices:number[],colors:number[]) {
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
  const out=mesh(geo,rockMaterial,0,0,0);out.castShadow=false;return out;
 }
 const ridgeSegments=112,ridgeRadii=[62,77,94,109,134,157],ridgeProfile=[0,.21,.68,1,.4,0];
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
  const a=k/7*Math.PI*2+.17,r=109+rand()*16,cx=Math.cos(a)*r,cz=Math.sin(a)*r;
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
 for(let i=0;i<16;i++) {
  const a=i/16*Math.PI*2,r=42+rand()*15;
  const dune=mesh(new THREE.SphereGeometry(1,12,6),sand,Math.cos(a)*r,-2,Math.sin(a)*r);dune.scale.set(11+rand()*8,3+rand()*4,9+rand()*10);dune.castShadow=false;
 }
 for(const [x,z] of [[-43,-22],[-48,-35],[42,27],[45,39]]) {
  cylinder(ivory,x,5,z,5,10);cylinder(steel,x,10.06,z,5.06,.17);
  cylinder(rust,x,11,z,1.04,1.85);
  for(const s of [-1,1])box(steel,x+s*5.03,6,z,.13,8,.13);
 }
 for(const [x,z] of [[43,-39],[-41,36]]) {
  for(const sx of [-1,1])for(const sz of [-1,1])beam(rust,new THREE.Vector3(x+sx*3,0,z+sz*3),new THREE.Vector3(x+sx*.8,23,z+sz*.8),.24);
  for(let y=5;y<=23;y+=4.5){const r=3-y*.095;for(const s of [-1,1]){box(steel,x+s*r,y,z,.16,.15,r*2);box(steel,x,y,z+s*r,r*2,.15,.16);}}
  box(dark,x,24,z,2.1,.7,2.1);cylinder(rust,x,28,z,.17,8);
 }
 // Rocks, loose cables, and small scrub stay near solids so paths read clearly.
 for(let i=0;i<95;i++) {
  const x=(rand()-.5)*(map.size-1),z=(rand()-.5)*(map.size-1);
  if(Math.abs(x)<map.size/2-3&&Math.abs(z)<map.size/2-3&&rand()>.26)continue;
  const rock=mesh(new THREE.DodecahedronGeometry(.08+rand()*.23,0),dustMat,x,.06,z);rock.scale.set(1.6,.45,1);rock.rotation.set(rand(),rand(),rand());rock.castShadow=false;
 }
 for(const [x,z] of [[-24,-25],[25,-15],[25,23],[-23,23],[-26,4],[5,-26]]) {
  for(let i=0;i<4;i++)beam(dustMat,new THREE.Vector3(x,0,z),new THREE.Vector3(x+(rand()-.5)*.65,.3+rand()*.35,z+(rand()-.5)*.65),.017);
 }
 // A windblown flag adds a small moving landmark near the tower.
 const flagGeo=new THREE.PlaneGeometry(1.55,.8,12,5);geos.push(flagGeo);
 const flagMat=mat(0xd1b361,1,0);flagMat.side=THREE.DoubleSide;
 const flag=new THREE.Mesh(flagGeo,flagMat);flag.position.set(map.id==='yard'?4.12:1.72,map.id==='yard'?8.6:12.2,2.7);flag.rotation.y=.12;root.add(flag);box(steel,map.id==='yard'?3.36:.96,map.id==='yard'?7.92:11.52,2.7,.054,3.25,.054);
 const originalFlag=new Float32Array(flagGeo.attributes.position.array as Float32Array);
 // Fine drifting particles use one draw call and remain deliberately subtle.
 const dustGeo=new THREE.BufferGeometry();geos.push(dustGeo);const dustCount=105;const dustPositions=new Float32Array(dustCount*3);
 for(let i=0;i<dustCount;i++){dustPositions[i*3]=(rand()-.5)*map.size;dustPositions[i*3+1]=.15+rand()*8;dustPositions[i*3+2]=(rand()-.5)*map.size;}
 dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));const pointsMaterial=new THREE.PointsMaterial({color:0xf3dec0,size:.06,transparent:true,opacity:.37,depthWrite:false});mats.push(pointsMaterial);
 const particles=new THREE.Points(dustGeo,pointsMaterial);root.add(particles);
 for(const [m,transforms] of batches) {
  const instanced=new THREE.InstancedMesh(unitBox,m,transforms.length);transforms.forEach((t,i)=>instanced.setMatrixAt(i,t));instanced.castShadow=true;instanced.receiveShadow=true;instanced.computeBoundingSphere();root.add(instanced);
 }
 // Merge static non-instanced details by material. Cylinders, signs, and the
 // distant terrain cost a handful of draws rather than hundreds of small draws.
 const staticBatches=new Map<THREE.Material,THREE.Mesh[]>();
 for(const child of [...root.children])if(child instanceof THREE.Mesh&&!(child instanceof THREE.InstancedMesh)&&child!==flag&&!Array.isArray(child.material)){
  if(!staticBatches.has(child.material))staticBatches.set(child.material,[]);staticBatches.get(child.material)!.push(child);
 }
 for(const [material,parts] of staticBatches){
  if(parts.length<2)continue;
  const copies=parts.map(part=>{part.updateMatrix();const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();return geometry.applyMatrix4(part.matrix);});
  const merged=mergeGeometries(copies,false);copies.forEach(geometry=>geometry.dispose());
  if(!merged)continue;geos.push(merged);const batch=new THREE.Mesh(merged,material);batch.castShadow=parts.some(part=>part.castShadow);batch.receiveShadow=true;root.add(batch);parts.forEach(part=>root.remove(part));
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
   material.metalness=Math.min(material.metalness,.45);material.needsUpdate=true;mats.push(material);surfaceMaterials.set(original,material);return material;
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
    instances.castShadow=true;instances.receiveShadow=true;instances.computeBoundingSphere();root.add(instances);
   }
   for(const slot of slots)slot.root.visible=false;
  }
 }).catch(()=>{/* Procedural collision-sized fallbacks stay usable offline. */});
 let previous=0;
 return {root,map,propSlots,lighting,
  update(time:number){
   const dt=previous?Math.min(.05,time-previous):0;previous=time;
   const pos=flagGeo.attributes.position as THREE.BufferAttribute;
   for(let i=0;i<pos.count;i++){const x=originalFlag[i*3];pos.setZ(i,Math.sin(x*5-time*3.2+originalFlag[i*3+1]*2)*.1*(x+.78));}pos.needsUpdate=true;flagGeo.computeVertexNormals();
   for(let i=0;i<dustCount;i++){dustPositions[i*3]+=dt*(.22+(i%7)*.032);dustPositions[i*3+1]+=Math.sin(time*.8+i)*dt*.025;if(dustPositions[i*3]>map.size/2)dustPositions[i*3]=-map.size/2;}dustGeo.attributes.position.needsUpdate=true;
  },
  dispose(){disposed=true;scene.remove(root);lighting.dispose();root.traverse(node=>{if(node instanceof THREE.InstancedMesh)node.dispose();});for(const g of new Set(geos))g.dispose();for(const m of new Set(mats))m.dispose();for(const t of textures)t.dispose();}
 };
}
