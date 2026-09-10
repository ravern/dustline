import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applySurfaceDetail, cloneKitModel, loadAssetKit } from './assets';
import type { Body, Team, WeaponId } from '../shared/types';

const steel = new THREE.MeshStandardMaterial({color:0x282b2b,metalness:.82,roughness:.32});
const black = new THREE.MeshStandardMaterial({color:0x101619,metalness:.38,roughness:.54});
const rubber = new THREE.MeshStandardMaterial({color:0x1d201e,roughness:.87});
const silver = new THREE.MeshStandardMaterial({color:0x9daba9,metalness:.95,roughness:.2});
const wood = new THREE.MeshStandardMaterial({color:0x82502c,roughness:.64,metalness:.06});
const tan = new THREE.MeshStandardMaterial({color:0xa59869,metalness:.33,roughness:.55});
const lens = new THREE.MeshStandardMaterial({color:0x123e42,metalness:.93,roughness:.08});
const glove = new THREE.MeshStandardMaterial({color:0x4a4d3d,roughness:1});
const skin = new THREE.MeshStandardMaterial({color:0xa78a63,roughness:1});
const boot = new THREE.MeshStandardMaterial({color:0x2a2d25,roughness:.95});
const stitching = new THREE.MeshStandardMaterial({color:0x93866a,roughness:.95});
const sleeve = new THREE.MeshStandardMaterial({color:0x59614d,roughness:1});
const pad = new THREE.MeshStandardMaterial({color:0x30372e,roughness:.89});
applySurfaceDetail(glove,'suede');applySurfaceDetail(sleeve,'weave');applySurfaceDetail(pad,'leather');
const templates = new Map<string, THREE.Group>();
const kitTargets = new Set<THREE.Group>();
let kitLoading: Promise<void> | undefined;

function cube(g:THREE.Group,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number) {
  const radius=Math.min(w,h,d)*.13;
  const o=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,1,radius),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;
}
function ellipsoid(g:THREE.Group,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number) {
  const geo=new THREE.SphereGeometry(1,12,8);geo.scale(w/2,h/2,d/2);
  const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;
}
function cyl(g:THREE.Group,m:THREE.Material,x:number,y:number,z:number,r:number,l:number,r2=r,axis='z') {
  const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r2,l,12),m);
  o.position.set(x,y,z);if(axis==='z')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.z=Math.PI/2;o.castShadow=true;g.add(o);return o;
}
function segment(g:THREE.Group,m:THREE.Material,a:number[],b:number[],radius:number,endRadius=radius) {
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),length=from.distanceTo(to);
  const o=cyl(g,m,0,0,0,endRadius,length,radius,'y');o.position.copy(from).add(to).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());return o;
}
function rail(g:THREE.Group,z:number,length:number,y:number) {
 cube(g,steel,0,y,z,.065,.023,length);
 for(let i=0;i<length/.034;i++)cube(g,black,0,y+.012,z-length/2+i*.034,.076,.018,.013);
}

/** Wrist origin, fingertips -Z. The palm, knuckles and three phalanges remain readable up close. */
function tacticalHand(side:'left'|'right'):THREE.Group {
 const g=new THREE.Group();g.name=side+'Hand';
 const geometry=new THREE.Group();geometry.name='handGeometry';g.add(geometry);
 ellipsoid(geometry,glove,0,0,-.039,.086,.044,.107);
 cube(geometry,pad,0,.018,-.039,.076,.015,.059);
 for(const x of [-.027,-.009,.009,.027])cube(geometry,stitching,x,.027,-.041,.003,.003,.046);
 const fingers=[[-.033,.066],[-.011,.081],[.012,.077],[.032,.063]];
 fingers.forEach(([x,length],index)=>{
  const root=[x,0,-.083+(index===3?.01:0)],p1=[x,.002,root[2]-length*.38],p2=[x,-.024,p1[2]-.014],tip=[x,-.049,p2[2]+length*.27];
  const radius=index===3?.0085:.0105;
  segment(geometry,glove,root,p1,radius,radius*.92);segment(geometry,glove,p1,p2,radius*.92,radius*.84);segment(geometry,glove,p2,tip,radius*.84,radius*.75);
  ellipsoid(geometry,pad,p1[0],p1[1]+.002,p1[2],radius*1.9,radius*1.8,radius*2.1);
  ellipsoid(geometry,glove,tip[0],tip[1],tip[2],radius*1.5,radius*1.5,radius*1.5);
 });
 const sign=side==='right'?-1:1;
 segment(geometry,glove,[sign*.036,-.008,-.014],[sign*.058,-.021,-.037],.015,.012);
 segment(geometry,glove,[sign*.058,-.021,-.037],[sign*.033,-.041,-.064],.012,.009);
 ellipsoid(geometry,glove,sign*.034,-.04,-.062,.021,.018,.022);
 cube(g,glove,0,0,.018,.073,.046,.034);
 cube(g,pad,0,.025,.02,.058,.012,.027);
 cube(g,stitching,sign*.025,.032,.02,.012,.003,.018);
 // Sleeve is a separate mesh group so a Blender hand can replace only the anatomical part.
 ellipsoid(g,skin,0,-.003,.052,.064,.054,.041);
 segment(g,sleeve,[0,-.006,.073],[sign*-.035,-.068,.285],.036,.055);
 ellipsoid(g,sleeve,sign*-.034,-.06,.259,.104,.106,.114);
 segment(g,sleeve,[sign*-.035,-.068,.285],[sign*.13,-.1,.51],.055,.073);
 segment(g,sleeve,[sign*.13,-.1,.51],[sign*.23,-.17,.74],.073,.084);
 for(let i=0;i<3;i++){const seam=cyl(g,pad,-sign*.005,-.013-i*.009,.084+i*.023,.038+i*.002,.009,.037+i*.002,'z');seam.rotation.x=-.2;}
 g.userData.kitPart='glove_'+side; kitTargets.add(g);replaceKitPart(g);
 return g;
}
function hands(g:THREE.Group,id:WeaponId) {
 const right=tacticalHand('right');right.position.set(.018,-.16,.126);right.rotation.set(1.23,.08,-1.38);g.add(right);
 if(id==='knife'){right.position.set(.027,-.092,.19);right.rotation.set(.3,.1,-.08);}
 else if(id!=='m9') {const left=tacticalHand('left');left.position.set(-.07,-.09,id==='intervention'?-.34:-.29);left.rotation.set(-.08,-.24,-1.12);g.add(left);}
 else {const left=tacticalHand('left');left.position.set(-.047,-.198,.115);left.rotation.set(.92,-.28,.35);g.add(left);}
}

/** Merge rigid detail by material once, keeping articulated joints independent. */
function batchRigid(g:THREE.Group) {
 for(const child of [...g.children])if(child instanceof THREE.Group)batchRigid(child);
 const batches=new Map<THREE.Material,THREE.Mesh[]>();
 for(const child of g.children)if(child instanceof THREE.Mesh&&!Array.isArray(child.material)){
  const list=batches.get(child.material)??[];list.push(child);batches.set(child.material,list);
 }
 for(const [material,meshes]of batches){
  const geometries=meshes.map(mesh=>{mesh.updateMatrix();const geo=mesh.geometry.index?mesh.geometry.toNonIndexed():new THREE.BufferGeometry().copy(mesh.geometry);geo.applyMatrix4(mesh.matrix);return geo;});
  const geometry=mergeGeometries(geometries,false);geometries.forEach(geo=>geo.dispose());
  if(!geometry)continue;
  const merged=new THREE.Mesh(geometry,material);merged.castShadow=true;merged.receiveShadow=true;
  geometry.userData.shared=true;geometry.computeBoundingSphere();
  meshes.forEach(mesh=>{g.remove(mesh);if(!mesh.geometry.userData.shared)mesh.geometry.dispose();});g.add(merged);
 }
}
/** Rigid bone weights preserve the authored silhouette while submitting whole actors in a handful of draws. */
function batchCharacter(root:THREE.Group,lowDetail:boolean){
 root.updateMatrixWorld(true);
 const bones:THREE.Bone[]=[],batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),canonical=new Map<string,THREE.Material>();
 const uniform=new THREE.MeshStandardMaterial({color:0x68705a,roughness:.94});
 const gear=new THREE.MeshStandardMaterial({color:0x353e33,roughness:.86});
 const face=new THREE.MeshStandardMaterial({color:0x9a8869,roughness:.95});
 const team=new THREE.MeshStandardMaterial({color:0xbeb696,roughness:.8});team.userData.team=true;
 function materialFor(source:THREE.Material):THREE.Material{
  const m=source as THREE.MeshStandardMaterial;
  if(lowDetail){if(m.userData.team)return team;if(m===skin||/suede|nylon/i.test(m.name))return face;return m.color&&Math.max(m.color.r,m.color.g,m.color.b)>.12?uniform:gear;}
  const key=m.userData.team?'team':m.name+':'+m.color?.getHexString()+':'+m.roughness+':'+m.metalness+':'+m.map?.uuid;
  let value=canonical.get(key);if(!value){value=m;canonical.set(key,value);}return value;
 }
 function convert(group:THREE.Object3D):THREE.Bone{
  const bone=new THREE.Bone();bone.name=group.name;bone.position.copy(group.position);bone.quaternion.copy(group.quaternion);bone.scale.copy(group.scale);const index=bones.length;bones.push(bone);
  for(const child of group.children){
   if(child instanceof THREE.Mesh){
    const geometry=child.geometry.index?child.geometry.toNonIndexed():new THREE.BufferGeometry().copy(child.geometry);geometry.applyMatrix4(child.matrixWorld);
    const count=geometry.getAttribute('position').count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
    for(let i=0;i<count;i++){indices[i*4]=index;weights[i*4]=1;}
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const material=materialFor(child.material as THREE.Material),list=batches.get(material)??[];list.push(geometry);batches.set(material,list);
    if(!child.geometry.userData.shared)child.geometry.dispose();
   }else bone.add(convert(child));
  }
  if(group instanceof THREE.Group)kitTargets.delete(group);return bone;
 }
 const rig=convert(root);root.clear();root.add(rig);root.updateMatrixWorld(true);
 const skeleton=new THREE.Skeleton(bones);
 for(const [material,geometries]of batches){
  const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!geometry)continue;
  geometry.userData.shared=true;const mesh=new THREE.SkinnedMesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);mesh.bind(skeleton);
  mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.8,0),1.35);
 }
 root.userData.lowDetail=lowDetail;
}
function fromTemplate(key:string,create:()=>THREE.Group,skin=false,lowDetail=false):THREE.Group {
 let template=templates.get(key);
 if(!template){template=create();if(skin)batchCharacter(template,lowDetail);else batchRigid(template);templates.set(key,template);}
 const clone=(skin?cloneSkeleton(template):template.clone(true)) as THREE.Group;individualMaterials(clone);
 clone.traverse(o=>{if(o instanceof THREE.Group&&o.userData.kitPart){kitTargets.add(o);replaceKitPart(o);}});
 return clone;
}
function replaceKitPart(target:THREE.Group){
 if(target.userData.kitLoaded)return;
 const asset=cloneKitModel(target.userData.kitPart);
 if(!asset)return;
 const previous=target.getObjectByName('handGeometry')??target.getObjectByName('bootGeometry');
 if(previous)target.remove(previous);
 const part=asset;part.name='blenderGeometry';
 part.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;o.geometry.userData.shared=true;}});
 target.add(part);target.userData.kitLoaded=true;
}
/** Asynchronous kit loading never blocks entering a match; geometry is reused by every soldier. */
export function loadModelKit():Promise<void>{
 if(!kitLoading)kitLoading=loadAssetKit().then(()=>{
  for(const target of kitTargets)replaceKitPart(target);
 }).catch(error=>{console.warn('Optional model kit could not load; using local geometry.',error);});
 return kitLoading;
}
export function releaseModel(object:THREE.Object3D){object.traverse(o=>{if(o instanceof THREE.Group)kitTargets.delete(o);});}
export function buildWeapon(id:WeaponId,withHands=true,lowDetail=false):THREE.Group {
 return fromTemplate('weapon:'+id+':'+withHands+':'+lowDetail,()=>{const result=createWeapon(id,withHands);if(lowDetail)result.traverse(o=>{if(o instanceof THREE.Mesh)o.material=steel;});return result;});
}
function createWeapon(id:WeaponId,withHands:boolean):THREE.Group {
 const g=new THREE.Group();g.name=id;
 if(id==='intervention') {
  cube(g,tan,0,-.01,.02,.108,.118,.41);
  cube(g,steel,0,.06,-.055,.078,.055,.4);
  cube(g,tan,0,-.048,.275,.07,.095,.22);
  cube(g,rubber,0,-.053,.392,.122,.185,.046);
  cube(g,black,0,.017,.267,.105,.074,.115);
  const grip=cube(g,black,0,-.128,.08,.07,.16,.085);grip.rotation.x=-.22;
  cube(g,steel,0,-.113,-.105,.083,.13,.115);
  cube(g,black,.042,-.069,.032,.011,.05,.063);
  cyl(g,steel,0,.048,-.56,.019,.71);
  cyl(g,black,0,.048,-.91,.029,.1);
  for(let i=0;i<5;i++)cube(g,black,0,.011,-.18-i*.042,.135,.09,.018);
  rail(g,-.06,.4,.091);
  for(const z of [-.07,.13]) {cube(g,black,0,.12,z,.042,.075,.049);cyl(g,black,0,.187,z,.054,.044);}
  cyl(g,black,0,.187,-.045,.044,.35);
  cyl(g,black,0,.187,-.243,.073,.095,.044);
  cyl(g,lens,0,.187,-.294,.06,.003);
  cyl(g,black,0,.187,.158,.057,.055);
  cyl(g,lens,0,.187,.187,.044,.005);
  cyl(g,black,0,.248,-.013,.026,.053,.025,'y');
  cyl(g,black,.046,.187,-.015,.025,.05,.025,'x');
  cyl(g,silver,.073,.047,.065,.012,.06,.012,'x');
  cyl(g,black,.101,.015,.065,.017,.056,.017,'y');
  for(const x of [-.045,.045]) {const b=cyl(g,black,x,-.055,-.44,.012,.23);b.rotation.x=.8;}
 } else if(id==='ak47') {
  cube(g,steel,0,.015,-.05,.093,.104,.37);
  cube(g,wood,0,-.012,.255,.076,.126,.24);
  cube(g,rubber,0,-.014,.38,.082,.14,.017);
  const grip=cube(g,wood,0,-.12,.064,.063,.16,.092);grip.rotation.x=-.28;
  cube(g,wood,0,.014,-.32,.112,.107,.2);
  for(const x of [-.056,.056]) for(let i=0;i<3;i++)cube(g,black,x,.045,-.268-i*.045,.004,.023,.017);
  cyl(g,steel,0,.044,-.55,.017,.3);
  cyl(g,steel,0,.09,-.363,.019,.24);
  cyl(g,black,0,.044,-.704,.023,.04);
  cube(g,steel,0,.086,-.632,.015,.109,.024);
  cube(g,steel,0,.143,-.632,.043,.013,.022);
  cube(g,black,0,.082,.09,.04,.028,.04);
  for(let i=0;i<4;i++) {const m=cube(g,steel,0,-.11-i*.041,-.109-i*.011,.079,.068,.101);m.rotation.x=.18+i*.13;}
  for(const x of [-.049,.049])cube(g,black,x,.051,-.06,.006,.021,.27);
  cyl(g,steel,.065,.035,-.008,.009,.08,.009,'x');
 } else if(id==='scar') {
  cube(g,tan,0,.024,-.087,.116,.126,.46);
  cube(g,tan,0,-.019,.243,.08,.133,.205);
  cube(g,tan,0,.027,.33,.096,.074,.115);
  cube(g,rubber,0,-.037,.381,.114,.184,.031);
  cube(g,black,0,.02,.142,.086,.125,.042);
  const grip=cube(g,black,0,-.129,.063,.065,.16,.083);grip.rotation.x=-.22;
  const mag=cube(g,black,0,-.159,-.105,.083,.195,.113);mag.rotation.x=.095;
  for(let i=0;i<3;i++)cube(g,steel,.044,-.1-i*.045,-.103,.009,.014,.093);
  cyl(g,steel,0,.055,-.477,.023,.32);
  cyl(g,black,0,.055,-.657,.031,.078);
  rail(g,-.045,.52,.099);
  for(const x of [-.065,.065]) {cube(g,black,x,.003,-.245,.018,.038,.17);for(let i=0;i<5;i++)cube(g,steel,x,.004,-.18-i*.028,.024,.047,.009);}
  cube(g,black,0,.142,.141,.041,.07,.035);
  cube(g,black,0,.118,-.453,.012,.119,.025);cube(g,steel,0,.064,-.453,.044,.03,.038);
  cyl(g,black,-.077,.034,.042,.011,.055,.011,'x');
 } else if(id==='m9') {
  cube(g,steel,0,.047,-.058,.077,.075,.244);
  cube(g,black,0,-.013,-.04,.084,.061,.185);
  const grip=cube(g,black,0,-.11,.044,.071,.159,.086);grip.rotation.x=-.19;
  for(let i=0;i<6;i++)for(const x of [-.039,.039])cube(g,black,x,.055,.009+i*.01,.004,.05,.003);
  cyl(g,black,0,.05,-.185,.019,.012);
  cube(g,black,0,.092,-.155,.009,.018,.015);
  cube(g,black,0,.092,.046,.053,.016,.015);
  cube(g,steel,0,-.063,-.047,.008,.007,.067);
  cube(g,steel,0,-.039,-.083,.008,.055,.008);
 } else {
  cyl(g,black,0,-.005,.14,.028,.18,.027);
  for(let i=0;i<8;i++)cyl(g,rubber,0,-.005,.067+i*.021,.031,.008);
  cube(g,steel,0,-.005,.037,.12,.021,.019);
  const shape=new THREE.Shape();shape.moveTo(-.028,0);shape.lineTo(.027,0);shape.lineTo(.027,-.21);shape.lineTo(0,-.315);shape.lineTo(-.028,-.245);shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.006,bevelEnabled:false});geo.rotateX(Math.PI/2);const blade=new THREE.Mesh(geo,silver);blade.position.set(0,-.004,.022);g.add(blade);
  cube(g,steel,-.012,-.002,-.095,.008,.009,.202);
 }
 // Small, contrasting controls and fasteners carry shape without texture downloads.
 if(id!=='knife'){for(const x of [-.049,.049])for(const z of [-.03,.072])cyl(g,silver,x,.014,z,.006,.006,.006,'x');cube(g,black,.052,.027,-.04,.009,.033,.085);}
 if(withHands)hands(g,id);return g;
}

function makeBoot():THREE.Group {
 const g=new THREE.Group();g.name='boot';g.userData.kitPart='boot';
 const geometry=new THREE.Group();geometry.name='bootGeometry';g.add(geometry);
 cube(geometry,boot,0,-.045,-.035,.135,.11,.264);
 ellipsoid(geometry,boot,0,-.017,.002,.13,.154,.15);
 ellipsoid(geometry,pad,0,-.027,-.112,.137,.081,.127);
 cube(geometry,black,0,-.096,-.041,.145,.026,.271);
 for(let i=0;i<4;i++){cube(geometry,pad,0,-.111,-.145+i*.063,.132,.014,.024);cube(geometry,stitching,0,.043-i*.006,-.034-i*.016,.05,.004,.008);}
 kitTargets.add(g);replaceKitPart(g);return g;
}
export function buildSoldier(color=0x69745a,local=false,lowDetail=false):THREE.Group {
 return fromTemplate('soldier:'+color+':'+local+':'+lowDetail,()=>{
 const g=new THREE.Group();const fatigues=new THREE.MeshStandardMaterial({color,roughness:.94});applySurfaceDetail(fatigues,'weave');
 const armor=new THREE.MeshStandardMaterial({color:0x3b4539,roughness:.87});
 const cloth=new THREE.MeshStandardMaterial({color:0x82795b,roughness:.96});
 const hips=new THREE.Group();hips.name='hips';hips.position.y=.91;g.add(hips);
 ellipsoid(hips,fatigues,0,.01,.015,.4,.25,.265);
 cube(hips,boot,0,.079,0,.398,.05,.267);
 for(const x of [-.17,.17])cube(hips,cloth,x,.005,-.134,.069,.16,.065);
 const spine=new THREE.Group();spine.name='spine';spine.position.y=.12;hips.add(spine);
 ellipsoid(spine,fatigues,0,.187,.019,.466,.5,.273);
 cube(spine,armor,0,.22,-.119,.369,.366,.12);
 cube(spine,armor,0,.234,.142,.346,.34,.13);
 for(const x of [-.117,0,.117]){cube(spine,cloth,x,.135,-.201,.095,.159,.056);cube(spine,pad,x,.2,-.234,.073,.037,.015);}
 for(const x of [-.151,.151]){cube(spine,armor,x,.411,0,.064,.055,.28);cube(spine,stitching,x,.32,-.177,.04,.038,.013);}
 cube(spine,black,.055,.282,-.192,.125,.016,.02);
 const badgeMaterial=new THREE.MeshStandardMaterial({color:0xc2c5b0,roughness:.78});badgeMaterial.userData.team=true;
 const badge=cube(spine,badgeMaterial,0,.344,-.184,.107,.053,.012);badge.name='teamBadge';
 const head=new THREE.Group();head.name='head';head.position.y=.46;spine.add(head);
 cyl(head,skin,0,.008,0,.064,.116,.069,'y');
 ellipsoid(head,skin,0,.112,-.012,.218,.263,.236);
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(.146,16,10,0,Math.PI*2,0,Math.PI/2+.23),armor);helmet.position.set(0,.177,.004);head.add(helmet);
 cube(head,armor,0,.148,-.127,.276,.028,.07);
 for(const s of [-1,1]){cube(head,black,s*.129,.107,.009,.025,.077,.122);cyl(head,pad,s*.14,.033,.012,.053,.033,.055,'x');}
 cube(head,black,0,.104,-.119,.206,.059,.054);
 cube(head,lens,0,.109,-.149,.176,.042,.007);
 ellipsoid(head,cloth,0,.029,-.1,.181,.096,.133);
 for(let i=0;i<3;i++)cube(head,pad,-.043+i*.043,.027,-.167,.019,.033,.003);
 for(const s of [-1,1]) {
  const leg=new THREE.Group();leg.name=s===-1?'leftLeg':'rightLeg';leg.position.set(s*.115,-.018,0);hips.add(leg);
  segment(leg,fatigues,[0,-.02,0],[s*.006,-.405,.002],.09,.076);
  ellipsoid(leg,fatigues,s*.065,-.17,.014,.079,.18,.127);
  const shin=new THREE.Group();shin.name=s===-1?'leftShin':'rightShin';shin.position.set(0,-.412,0);leg.add(shin);
  segment(shin,fatigues,[0,0,0],[0,-.329,.012],.074,.051);
  cube(shin,armor,0,.005,-.073,.132,.144,.046);
  cube(shin,pad,0,-.089,.006,.15,.029,.155);
  const foot=makeBoot();foot.position.set(0,-.364,.006);shin.add(foot);
  const arm=new THREE.Group();arm.name=s===-1?'leftArm':'rightArm';arm.position.set(s*.256,.372,.005);spine.add(arm);
  segment(arm,fatigues,[0,0,0],[s*.015,-.235,-.013],.073,.055);
  ellipsoid(arm,armor,0,-.018,0,.157,.134,.161);
  const patchMaterial=new THREE.MeshStandardMaterial({color:0xbeb696,roughness:.9});patchMaterial.userData.team=true;
  const patch=cube(arm,patchMaterial,s*.079,-.105,-.01,.009,.071,.09);patch.name='shoulderPatch';
  const forearm=new THREE.Group();forearm.name=s===-1?'leftForearm':'rightForearm';forearm.position.set(0,-.249,0);forearm.rotation.x=1.3;arm.add(forearm);
  segment(forearm,fatigues,[0,0,0],[0,-.212,0],.055,.036);
  cube(forearm,pad,0,-.03,.046,.078,.106,.026);
  const hand=tacticalHand(s===-1?'left':'right');hand.position.set(0,-.236,0);hand.rotation.set(-Math.PI/2,0,0);
  // Third-person sleeves already belong to the arm skeleton.
  for(const child of [...hand.children])if(child.name!=='handGeometry'&&child.name!=='blenderGeometry')hand.remove(child);
  forearm.add(hand);
 }
 const held=new THREE.Group();held.name='weaponAnchor';held.position.set(.055,.179,-.21);spine.add(held);
 return g;
 },!local,lowDetail);
}

/** Lower limbs are world-space, so looking down and sliding never detach the feet from the ground. */
export function buildLocalBody():THREE.Group {
 const g=buildSoldier(0x657059,true);const spine=g.getObjectByName('spine');if(spine)spine.visible=false;
 g.name='localBody';g.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=false;});return g;
}
export function setSoldierTeam(model:THREE.Group,team:Team|null,teammate:boolean){
 const key=String(team)+teammate;if(model.userData.teamKey===key)return;model.userData.teamKey=key;
 const color=team==='red'?0xdb6558:team==='blue'?0x5795d9:0xbeb696;
 // Material is unique per actor, while all geometry is shared.
 model.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;if(m.color&&m.userData.team){m.color.setHex(color);m.emissive?.setHex(teammate?color:0x000000);m.emissiveIntensity=.12;}}});
}
export function poseSoldier(model:THREE.Group,body:Body,time:number,dt:number,local=false){
 const target=body.stance==='stand'?0:body.stance==='crouch'?1:2;
 model.userData.stance=THREE.MathUtils.damp(model.userData.stance??target,target,18,dt);
 const stance=model.userData.stance as number,crouch=Math.min(1,stance),slide=Math.max(0,stance-1);
 const hips=model.getObjectByName('hips')!,spine=model.getObjectByName('spine')!;
 hips.position.y=THREE.MathUtils.lerp(.91,.43,crouch)-slide*.22;
 hips.position.z=.07*crouch+.06*slide;hips.rotation.x=0;
 spine.position.y=.12-.055*crouch;spine.rotation.x=-.85*crouch+1.9*slide;
 const head=model.getObjectByName('head');if(head)head.rotation.x=body.pitch*.46-spine.rotation.x*.75;
 const speed=Math.hypot(body.vx,body.vz);model.userData.gait=(model.userData.gait??0)+dt*speed*(crouch>0?2.4:1.95);
 const moving=body.grounded?Math.min(1,speed/5):0;
 const gait=Math.sin(model.userData.gait)*(.59-.36*crouch)*moving*(1-slide);
 for(const [side,sign]of [['left',-1],['right',1]] as const){
  const leg=model.getObjectByName(side+'Leg')!,shin=model.getObjectByName(side+'Shin')!;
  leg.rotation.x=1.33*crouch+.22*slide+gait*sign;leg.rotation.z=sign*(.015+.095*slide);
  shin.rotation.x=-2.33*crouch+2.15*slide-Math.max(0,-gait*sign)*.5;
  const foot=shin.getObjectByName('boot');if(foot)foot.rotation.x=.9*crouch-1.62*slide;

 }
 if(local){hips.position.z-=slide*.04;spine.visible=false;}
 const anchor=model.getObjectByName('weaponAnchor');
 if(anchor){
  anchor.rotation.x=body.pitch*.6-spine.rotation.x;
  for(const [side,sign]of [['left',-1],['right',1]] as const){
   const arm=model.getObjectByName(side+'Arm')!,forearm=model.getObjectByName(side+'Forearm')!;
   const target=new THREE.Vector3(side==='left'?-.052:.018,side==='left'?-.04:-.104,side==='left'?-.19:.054).applyEuler(anchor.rotation).add(anchor.position);
   const delta=target.sub(arm.position),distance=Math.min(.481,delta.length()),direction=delta.normalize();
   const reach=(.249*.249-.236*.236+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,.249*.249-reach*reach));
   const bend=new THREE.Vector3(sign*.55,-.8,.3);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
   const elbow=direction.clone().multiplyScalar(reach).addScaledVector(bend,height);
   arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),elbow.clone().normalize());
   const foreDirection=direction.multiplyScalar(distance).sub(elbow).normalize().applyQuaternion(arm.quaternion.clone().invert());
   forearm.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),foreDirection);
  }
 }
}

function individualMaterials(g:THREE.Group){const owned=new Map<THREE.Material,THREE.Material>();g.traverse(o=>{if(o instanceof THREE.Mesh){const source=o.material as THREE.Material;if(!owned.has(source))owned.set(source,source.clone());o.material=owned.get(source)!;}});}
