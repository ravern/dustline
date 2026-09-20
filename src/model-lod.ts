import * as THREE from 'three';
import type { WeaponId } from '../shared/types';

// These silhouettes are used only when their small details occupy less than a
// pixel. Joints and equipment dimensions match the close character rig.
function box(parent:THREE.Object3D,material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function oval(parent:THREE.Object3D,material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number){
  const geometry=new THREE.SphereGeometry(1,8,5);geometry.scale(w/2,h/2,d/2);
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function tube(parent:THREE.Object3D,material:THREE.Material,x:number,y:number,z:number,r:number,length:number,end=r,forward=false){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,end,length,7),material);mesh.position.set(x,y,z);if(forward)mesh.rotation.x=Math.PI/2;parent.add(mesh);return mesh;
}
function joint(parent:THREE.Object3D,name:string,x:number,y:number,z:number){const group=new THREE.Group();group.name=name;group.position.set(x,y,z);parent.add(group);return group;}

export function createDistantSoldier(color:number):THREE.Group{
  const root=new THREE.Group(),cloth=new THREE.MeshStandardMaterial({color,roughness:.94});
  const armor=new THREE.MeshStandardMaterial({color:0x3b4539,roughness:.87}),dark=new THREE.MeshStandardMaterial({color:0x252c26,roughness:.9});
  const skin=new THREE.MeshStandardMaterial({color:0x9a8869,roughness:.95}),webbing=new THREE.MeshStandardMaterial({color:0x82795b,roughness:.96});
  const team=new THREE.MeshStandardMaterial({color:0xbeb696,roughness:.8});team.userData.team=true;
  const hips=joint(root,'hips',0,.91,0);oval(hips,cloth,0,.01,.015,.4,.25,.265);box(hips,dark,0,.079,0,.398,.05,.267);
  const spine=joint(hips,'spine',0,.12,0);oval(spine,cloth,0,.187,.019,.466,.5,.273);
  box(spine,armor,0,.22,-.119,.369,.366,.12);box(spine,armor,0,.234,.142,.346,.34,.13);
  for(const x of [-.117,0,.117])box(spine,webbing,x,.135,-.201,.095,.159,.056);
  box(spine,team,0,.344,-.184,.107,.053,.012);
  const head=joint(spine,'head',0,.46,0);oval(head,skin,0,.112,-.012,.218,.263,.236);
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.146,10,6,0,Math.PI*2,0,Math.PI/2+.23),armor);helmet.position.set(0,.177,.004);head.add(helmet);
  box(head,dark,0,.104,-.119,.206,.059,.054);oval(head,webbing,0,.029,-.1,.181,.096,.133);
  for(const sign of [-1,1]){
    const side=sign<0?'left':'right',leg=joint(hips,side+'Leg',sign*.115,-.018,0);
    tube(leg,cloth,sign*.003,-.212,.001,.09,.39,.076);
    const shin=joint(leg,side+'Shin',0,-.412,0);tube(shin,cloth,0,-.164,.006,.074,.329,.051);box(shin,armor,0,.005,-.073,.132,.144,.046);
    const foot=joint(shin,'boot',0,-.364,.006);box(foot,dark,0,-.045,-.035,.135,.11,.264);box(foot,dark,0,.005,.005,.124,.16,.14);
    const arm=joint(spine,side+'Arm',sign*.256,.372,.005);tube(arm,cloth,sign*.008,-.12,-.006,.073,.24,.055);oval(arm,armor,0,-.018,0,.157,.134,.161);
    box(arm,team,sign*.079,-.105,-.01,.009,.071,.09);
    const forearm=joint(arm,side+'Forearm',0,-.249,0);forearm.rotation.x=1.3;tube(forearm,cloth,0,-.106,0,.055,.212,.036);oval(forearm,dark,0,-.259,0,.075,.10,.073);
  }
  joint(spine,'weaponAnchor',.055,.179,-.21);return root;
}

/** Retain stock, magazine, barrel and optic profiles, without invisible rail teeth. */
export function createDistantWeapon(id:WeaponId):THREE.Group{
  const root=new THREE.Group(),steel=new THREE.MeshStandardMaterial({color:0x303536}),black=new THREE.MeshStandardMaterial({color:0x171d1d});
  const tan=new THREE.MeshStandardMaterial({color:0xa59869}),wood=new THREE.MeshStandardMaterial({color:0x82502c});
  if(id==='intervention'){
    box(root,tan,0,-.01,.02,.108,.118,.41);box(root,tan,0,-.048,.275,.07,.095,.22);box(root,black,0,-.053,.392,.122,.185,.046);
    box(root,black,0,-.128,.08,.07,.16,.085);box(root,steel,0,-.113,-.105,.083,.13,.115);
    tube(root,steel,0,.048,-.56,.019,.71,.019,true);tube(root,black,0,.048,-.91,.029,.1,.029,true);
    for(const z of [-.07,.13])box(root,black,0,.12,z,.042,.075,.049);
    tube(root,black,0,.187,-.045,.044,.35,.044,true);tube(root,black,0,.187,-.243,.073,.095,.044,true);tube(root,black,0,.187,.158,.057,.055,.057,true);
  }else if(id==='ak47'||id==='scar'){
    const ak=id==='ak47',body=ak?steel:tan;box(root,body,0,.02,-.07,ak?.093:.116,ak?.104:.126,ak?.37:.46);
    box(root,ak?wood:tan,0,-.012,.255,.08,.133,.24);box(root,black,0,-.025,.38,.108,.16,.025);
    const grip=box(root,ak?wood:black,0,-.12,.064,.063,.16,.092);grip.rotation.x=-.25;
    if(ak){box(root,wood,0,.014,-.32,.112,.107,.2);for(let i=0;i<3;i++){const mag=box(root,steel,0,-.125-i*.058,-.111-i*.018,.079,.08,.101);mag.rotation.x=.2+i*.16;}}
    else {const mag=box(root,black,0,-.159,-.105,.083,.195,.113);mag.rotation.x=.095;box(root,black,0,.096,-.06,.07,.027,.51);}
    tube(root,steel,0,.05,ak?-.55:-.477,.02,.32,.02,true);tube(root,black,0,.05,ak?-.704:-.657,.028,.06,.028,true);
    box(root,black,0,.093,ak?-.632:-.453,.021,.11,.024);
  }else if(id==='knife'){
    tube(root,black,0,-.005,.14,.028,.18,.028,true);box(root,steel,0,-.005,.037,.12,.021,.019);
    const shape=new THREE.Shape();shape.moveTo(-.028,0);shape.lineTo(.027,0);shape.lineTo(.027,-.21);shape.lineTo(0,-.285);shape.lineTo(-.028,-.245);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.006,bevelEnabled:false});geometry.rotateX(Math.PI/2);const blade=new THREE.Mesh(geometry,steel);blade.position.set(0,-.004,.022);root.add(blade);
  }else{
    const eagle=id==='deagle',glock=id==='glock';
    box(root,steel,0,-.025,eagle?-.065:-.045,eagle?.10:.077,eagle?.084:.067,eagle?.25:.205);
    box(root,black,0,-.07,-.033,eagle?.09:.074,.035,eagle?.208:.175);
    const grip=box(root,black,0,-.142,.04,eagle?.087:.071,.145,.086);grip.rotation.x=glock?-.3:-.19;
    box(root,black,0,.014,-.14,.012,.02,.018);box(root,black,0,.014,.049,.052,.02,.018);
    box(root,steel,0,-.132,-.045,.008,.009,.07);box(root,steel,0,-.102,-.08,.008,.061,.009);
  }
  const material=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.45,roughness:.58});
  root.traverse(object=>{if(object instanceof THREE.Mesh){const source=object.material as THREE.MeshStandardMaterial;const values=new Float32Array(object.geometry.attributes.position.count*3);for(let i=0;i<values.length;i+=3)source.color.toArray(values,i);object.geometry.setAttribute('color',new THREE.BufferAttribute(values,3));object.material=material;}});
  steel.dispose();black.dispose();tan.dispose();wood.dispose();return root;
}
