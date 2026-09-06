import * as THREE from 'three';
import type { WeaponId } from '../shared/types';

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
function cube(g:THREE.Group,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number) {
  const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;g.add(o);return o;
}
function cyl(g:THREE.Group,m:THREE.Material,x:number,y:number,z:number,r:number,l:number,r2=r,axis='z') {
  const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r2,l,12),m);
  o.position.set(x,y,z);if(axis==='z')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.z=Math.PI/2;o.castShadow=true;g.add(o);return o;
}
function rail(g:THREE.Group,z:number,length:number,y:number) {
 cube(g,steel,0,y,z,.065,.023,length);
 for(let i=0;i<length/.034;i++)cube(g,black,0,y+.012,z-length/2+i*.034,.076,.018,.013);
}
function hands(g:THREE.Group,id:WeaponId) {
 const hand=cube(g,glove,.045,-.155,.045,.115,.145,.16);hand.rotation.x=-.25;
 const wrist=cube(g,glove,.055,-.22,.14,.12,.1,.18);wrist.rotation.x=-.45;
 if(id!=='m9' && id!=='knife') {const palm=cube(g,glove,-.044,-.082,-.33,.105,.09,.16);palm.rotation.z=-.2;cyl(g,glove,-.094,-.118,-.28,.049,.13,.048,'z');}
}
export function buildWeapon(id:WeaponId,withHands=true):THREE.Group {
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
  cube(g,black,0,.141,-.453,.012,.073,.025);
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
 if(withHands)hands(g,id);individualMaterials(g);return g;
}

export function buildSoldier(color=0x7b7958):THREE.Group {
 const g=new THREE.Group();const fatigues=new THREE.MeshStandardMaterial({color,roughness:1});
 const armor=new THREE.MeshStandardMaterial({color:0x444c3d,roughness:.94});
 const cloth=new THREE.MeshStandardMaterial({color:0x8d8467,roughness:.92});
 const torso=cube(g,fatigues,0,1.18,0,.47,.55,.27);
 cube(g,armor,0,1.19,-.155,.43,.39,.095);
 cube(g,armor,0,1.21,.17,.38,.37,.15);
 for(const x of [-.13,0,.13])cube(g,cloth,x,1.14,-.219,.1,.17,.048);
 cube(g,boot,0,.901,0,.46,.07,.28);
 const head=new THREE.Group();head.name='head';head.position.y=1.49;g.add(head);
 cyl(head,skin,0,.072,0,.13,.24,.115,'y');
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(.158,12,8,0,Math.PI*2,0,Math.PI/2+.22),armor);helmet.position.y=.147;head.add(helmet);
 cube(head,armor,0,.13,-.139,.29,.042,.048);
 cube(head,black,0,.079,-.117,.215,.07,.039);
 cube(head,cloth,0,-.008,-.113,.209,.082,.05);
 for(const s of [-1,1]) {
  const leg=new THREE.Group();leg.name=s===-1?'leftLeg':'rightLeg';leg.position.set(s*.135,.91,0);g.add(leg);
  cube(leg,fatigues,0,-.225,0,.205,.44,.23);
  cube(leg,fatigues,0,-.614,.025,.18,.35,.205);
  cube(leg,armor,0,-.448,-.118,.15,.155,.044);
  cube(leg,boot,0,-.828,-.055,.207,.16,.31);
  const arm=new THREE.Group();arm.name=s===-1?'leftArm':'rightArm';arm.position.set(s*.292,1.411,0);g.add(arm);
  cube(arm,fatigues,0,-.13,0,.17,.3,.19);
  cube(arm,armor,0,-.04,-.011,.192,.15,.202);
  const fore=cube(arm,fatigues,s*.002,-.307,-.14,.143,.15,.31);fore.rotation.x=.18;
  cube(arm,glove,s*.006,-.303,-.326,.136,.14,.11);
 }
 // A compact third-person rifle keeps other players visibly armed.
 const held=new THREE.Group();held.name='heldWeapon';held.position.set(.05,1.12,-.36);g.add(held);
 cube(held,steel,0,0,0,.084,.095,.3);
 cube(held,wood,0,-.01,.215,.069,.1,.15);
 cube(held,rubber,0,-.01,.299,.082,.12,.02);
 cube(held,wood,0,0,-.24,.105,.09,.18);
 const hg=cube(held,wood,0,-.1,.065,.06,.15,.075);hg.rotation.x=-.23;
 const hm=cube(held,black,0,-.128,-.058,.068,.21,.096);hm.rotation.x=.22;
 cyl(held,steel,0,.03,-.415,.018,.23);cyl(held,black,0,.03,-.545,.024,.035);
 cube(held,steel,0,.09,-.491,.015,.1,.02);
 individualMaterials(g);return g;
}

function individualMaterials(g:THREE.Group){const owned=new Map<THREE.Material,THREE.Material>();g.traverse(o=>{if(o instanceof THREE.Mesh){const source=o.material as THREE.Material;if(!owned.has(source))owned.set(source,source.clone());o.material=owned.get(source)!;}});}
