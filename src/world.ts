import * as THREE from 'three';
import { MAP_BOXES, MAP_SIZE } from '../shared/map';
import type { Box } from '../shared/types';

/** Everything in the arena is generated locally; there are no texture or model downloads. */
export function buildWorld(scene:THREE.Scene):{update(time:number):void;dispose():void} {
 const root=new THREE.Group();root.name='Dustline arena';scene.add(root);
 scene.background=new THREE.Color(0xe1d4b9);scene.fog=new THREE.FogExp2(0xe1d4b9,.0085);
 const hemi=new THREE.HemisphereLight(0xf1f6f4,0x87704f,2.65);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xffe5bc,3.8);sun.position.set(-24,44,30);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-43;sun.shadow.camera.right=43;sun.shadow.camera.top=43;sun.shadow.camera.bottom=-43;
 sun.shadow.camera.near=1;sun.shadow.camera.far=130;sun.shadow.bias=-.00045;sun.shadow.normalBias=.035;scene.add(sun);
 const mats:THREE.Material[]=[];const textures:THREE.Texture[]=[];const geos:THREE.BufferGeometry[]=[];
 const mat=(color:number,roughness=.83,metalness=.05,map?:THREE.Texture)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness,map});mats.push(m);return m;};
 let seed=81723;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const texture=(kind:'sand'|'metal'|'concrete')=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d')!;
  c.fillStyle=kind==='sand'?'#c0ad87':kind==='metal'?'#c6c4b6':'#b2b0a2';c.fillRect(0,0,512,512);
  for(let i=0;i<20000;i++){const light=rand()>.52;c.fillStyle=light?'rgba(255,250,224,.065)':'rgba(36,30,21,.045)';const r=kind==='metal'?rand()*2:rand()*3;c.fillRect(rand()*512,rand()*512,r,r);}
  if(kind==='sand')for(let i=0;i<160;i++){c.strokeStyle='rgba(137,105,65,.06)';c.lineWidth=rand()*2+1;c.beginPath();const x=rand()*512,y=rand()*512;c.moveTo(x,y);c.bezierCurveTo(x+16,y-3,x+26,y+5,x+60,y+2);c.stroke();}
  if(kind==='metal')for(let i=0;i<32;i++){const x=rand()*512;c.strokeStyle='rgba(71,45,27,.1)';c.lineWidth=rand()*4;c.beginPath();c.moveTo(x,0);c.lineTo(x+rand()*2,512);c.stroke();}
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='sand'?12:1,kind==='sand'?12:1);t.anisotropy=8;textures.push(t);return t;
 };
 const metalMap=texture('metal'),concreteMap=texture('concrete');
 const sand=mat(0xdfc698,1,0,texture('sand')),steel=mat(0x4d5348,.74,.57,metalMap),yellow=mat(0xb69b46,.68,.4,metalMap);
 const concrete=mat(0xb5ad93,.96,0,concreteMap),dark=mat(0x2e352f,.76,.5,metalMap),rust=mat(0x794b31,.87,.35,metalMap),wood=mat(0x86754f,.98,0,metalMap);
 const silverMetal=mat(0x99998c,.45,.75);
 const blue=mat(0x496465,.84,.22,metalMap),dustMat=mat(0x8c7755,1,0),ivory=mat(0xd4c9a5,.85,.15,metalMap);
 const cache=new Map<number,THREE.MeshStandardMaterial>();
 const colored=(color:number)=>{if(!cache.has(color))cache.set(color,mat(color,.81,.32,metalMap));return cache.get(color)!;};
 const unitBox=new THREE.BoxGeometry(1,1,1);geos.push(unitBox);
 // Batch repeated architecture by material to leave frame time for the game.
 const batches=new Map<THREE.Material,THREE.Matrix4[]>();const dummy=new THREE.Object3D();
 function box(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,ry=0){dummy.position.set(x,y,z);dummy.rotation.set(0,ry,0);dummy.scale.set(w,h,d);dummy.updateMatrix();if(!batches.has(m))batches.set(m,[]);batches.get(m)!.push(dummy.matrix.clone());}
 function mesh(geo:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number){geos.push(geo);const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;root.add(o);return o;}
 function cylinder(m:THREE.Material,x:number,y:number,z:number,r:number,h:number,axis='y',r2=r,sides=16){const o=mesh(new THREE.CylinderGeometry(r,r2,h,sides),m,x,y,z);if(axis==='z')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.z=Math.PI/2;return o;}
 function beam(m:THREE.Material,a:THREE.Vector3,b:THREE.Vector3,width:number){const mid=a.clone().add(b).multiplyScalar(.5);const o=mesh(new THREE.BoxGeometry(width,a.distanceTo(b),width),m,mid.x,mid.y,mid.z);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return o;}
 function sign(text:string,bg:string,fg:string,x:number,y:number,z:number,w:number,h:number,ry=0,rz=0){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;const c=canvas.getContext('2d')!;c.fillStyle=bg;c.fillRect(0,0,768,256);c.strokeStyle=fg;c.lineWidth=5;c.strokeRect(16,16,736,224);c.fillStyle=fg;c.font='900 88px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(text,384,136,710);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);const m=new THREE.MeshStandardMaterial({map:t,roughness:.92,side:THREE.DoubleSide});mats.push(m);const o=mesh(new THREE.PlaneGeometry(w,h),m,x,y,z);o.rotation.set(0,ry,rz);return o;
 }
 const floor=mesh(new THREE.PlaneGeometry(280,280),sand,0,-.025,0);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
 // Faded truck tracks and settling dirt anchor the structures in the sand.
 for(let lane=0;lane<3;lane++)for(const side of [-1,1])for(let j=0;j<46;j++)box(dustMat,-23+lane*23+side*.67,-.007,-27+j*1.19,.31,.014,.72);
 for(const b of MAP_BOXES) {
  const m=b.color?colored(b.color):b.kind==='boundary'?concrete:b.kind==='deck'||b.kind==='stairs'?steel:b.kind==='rail'?yellow:b.kind==='crate'?wood:b.kind==='steel'?yellow:b.kind==='barrier'?concrete:steel;
  if(b.kind==='pipe') {cylinder(rust,b.x,b.y,b.z,b.w/2,b.d,'z');continue;}
  if(b.kind==='tank') {tank(b,m);continue;}
  if(b.kind==='rail') {railing(b);continue;}
  box(m,b.x,b.y,b.z,b.w,b.h,b.d);
  if(b.kind==='container')container(b,m);
  if(b.kind==='generator')generator(b,m);
  if(b.kind==='crate')crate(b);
  if(b.kind==='barrier')barrier(b);
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
 function crate(b:Box){
  for(const s of [-1,1]) {box(dark,b.x+s*b.w*.3,b.y,b.z,b.w*.08,b.h+.06,b.d+.035);box(wood,b.x,b.y-b.h/2+.025,b.z+s*b.d*.37,b.w+.1,.12,.16);}
  for(let j=1;j<5;j++)box(dustMat,b.x,b.y-b.h/2+j*b.h/5,b.z+b.d/2+.007,b.w,.012,.012);
  sign('↑  ↑','#a39770','#393e2b',b.x,b.y,b.z+b.d/2+.018,.54,.35);
 }
 function barrier(b:Box){
  const longX=b.w>b.d;const len=longX?b.w:b.d;
  box(concrete,b.x,.12,b.z,b.w+.22,.24,b.d+.22);
  for(let p=-len/2+.18;p<len/2;p+=.58) {
   if(longX){box(yellow,b.x+p,.81,b.z+b.d/2+.011,.33,.33,.018);box(yellow,b.x+p,.81,b.z-b.d/2-.011,.33,.33,.018);}
   else {box(yellow,b.x+b.w/2+.011,.81,b.z+p,.018,.33,.33);box(yellow,b.x-b.w/2-.011,.81,b.z+p,.018,.33,.33);}
  }
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
 // Exterior industry, terrain, and distant mountain ridges close the horizon.
 // Connected, irregular ridges and worn plateaus avoid repeated cone silhouettes.
 const rockMaterial=new THREE.MeshStandardMaterial({color:0xc4ad89,roughness:1,vertexColors:true,flatShading:true});mats.push(rockMaterial);
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
  const x=(rand()-.5)*57,z=(rand()-.5)*57;
  if(Math.abs(x)<26&&Math.abs(z)<26&&rand()>.26)continue;
  const rock=mesh(new THREE.DodecahedronGeometry(.08+rand()*.23,0),dustMat,x,.06,z);rock.scale.set(1.6,.45,1);rock.rotation.set(rand(),rand(),rand());rock.castShadow=false;
 }
 for(const [x,z] of [[-24,-25],[25,-15],[25,23],[-23,23],[-26,4],[5,-26]]) {
  for(let i=0;i<4;i++)beam(dustMat,new THREE.Vector3(x,0,z),new THREE.Vector3(x+(rand()-.5)*.65,.3+rand()*.35,z+(rand()-.5)*.65),.017);
 }
 // A windblown flag adds a small moving landmark near the tower.
 const flagGeo=new THREE.PlaneGeometry(1.55,.8,12,5);geos.push(flagGeo);
 const flagMat=mat(0xd1b361,1,0);flagMat.side=THREE.DoubleSide;
 const flag=new THREE.Mesh(flagGeo,flagMat);flag.position.set(4.12,8.6,2.7);flag.rotation.y=.12;root.add(flag);box(steel,3.36,7.92,2.7,.054,3.25,.054);
 const originalFlag=new Float32Array(flagGeo.attributes.position.array as Float32Array);
 // Fine drifting particles use one draw call and remain deliberately subtle.
 const dustGeo=new THREE.BufferGeometry();geos.push(dustGeo);const dustCount=105;const dustPositions=new Float32Array(dustCount*3);
 for(let i=0;i<dustCount;i++){dustPositions[i*3]=(rand()-.5)*58;dustPositions[i*3+1]=.15+rand()*8;dustPositions[i*3+2]=(rand()-.5)*58;}
 dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));const pointsMaterial=new THREE.PointsMaterial({color:0xf3dec0,size:.06,transparent:true,opacity:.37,depthWrite:false});mats.push(pointsMaterial);
 const particles=new THREE.Points(dustGeo,pointsMaterial);root.add(particles);
 for(const [m,transforms] of batches) {
  const instanced=new THREE.InstancedMesh(unitBox,m,transforms.length);transforms.forEach((t,i)=>instanced.setMatrixAt(i,t));instanced.castShadow=true;instanced.receiveShadow=true;instanced.computeBoundingSphere();root.add(instanced);
 }
 let previous=0;
 return {
  update(time:number){
   const dt=previous?Math.min(.05,time-previous):0;previous=time;
   const pos=flagGeo.attributes.position as THREE.BufferAttribute;
   for(let i=0;i<pos.count;i++){const x=originalFlag[i*3];pos.setZ(i,Math.sin(x*5-time*3.2+originalFlag[i*3+1]*2)*.1*(x+.78));}pos.needsUpdate=true;flagGeo.computeVertexNormals();
   for(let i=0;i<dustCount;i++){dustPositions[i*3]+=dt*(.22+(i%7)*.032);dustPositions[i*3+1]+=Math.sin(time*.8+i)*dt*.025;if(dustPositions[i*3]>29)dustPositions[i*3]=-29;}dustGeo.attributes.position.needsUpdate=true;
  },
  dispose(){scene.remove(root,hemi,sun);for(const g of new Set(geos))g.dispose();for(const m of new Set(mats))m.dispose();for(const t of textures)t.dispose();sun.shadow.map?.dispose();}
 };
}
