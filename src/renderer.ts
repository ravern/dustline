import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld } from './world';
import { buildLocalBody, buildSoldier, buildWeapon, loadModelKit, poseSoldier, releaseModel, setSoldierTeam } from './models';
import { eyeHeight } from '../shared/physics';
import { poseViewmodelArms } from './arms';
import { createViewLighting } from './lighting';
import { WEAPON_VIEW } from './weapon-assets';
import { getMap, type MapId } from '../shared/map';
import { WEAPONS, weaponForSlot } from '../shared/weapons';
import type { Body, FlagState, PlayerState, Team, WeaponId, Vec3 } from '../shared/types';

export class GameView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(82, 1, .035, 280);
  viewScene = new THREE.Scene();
  viewCamera = new THREE.PerspectiveCamera(72, 1, .015, 20);
  viewLighting = createViewLighting(this.viewScene);
  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(35, 1, .01, 20);
  previewRenderer?: THREE.WebGLRenderer;
  previewModel?: THREE.Group;
  soldiers = new Map<string, THREE.Group>();
  localBody = buildLocalBody();
  objectives = new Map<Team, {base:THREE.Group; flag:THREE.Group; state:FlagState}>();
  effects: {object:THREE.Object3D;until:number}[] = [];
  gun?: THREE.Group;
  gunId?: WeaponId;
  flash = new THREE.Group();
  flashUntil = 0;
  kick = 0;
  landing = 0;
  eye = 1.6;
  ads = 0;
  fov = 82;
  sensitivity = 1;
  quality: 'high' | 'low' = 'high';
  world: ReturnType<typeof buildWorld>;
  private mapId:MapId='yard';
  private lastGrounded=true;
  private lastVelocityY=0;
  private lastYaw=0;
  private lastPitch=0;
  private sway=new THREE.Vector2();
  private movementPhase=0;
  private slideBlend=0;
  private objectiveSelf='';
  private weaponSwap=1;
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.info.autoReset=false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.world = buildWorld(this.scene);
    this.localBody.visible=false;this.scene.add(this.localBody);
    this.camera.rotation.order = 'YXZ';
    this.viewScene.add(this.flash);
    const fm = new THREE.MeshBasicMaterial({color:0xffce70,transparent:true,opacity:.88,depthWrite:false,side:THREE.DoubleSide});
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(.095,.21), fm); m.rotation.z=i*Math.PI/3; this.flash.add(m); }
    this.flash.position.set(.29,-.22,-1.35); this.flash.visible = false;
    this.previewScene.add(new THREE.HemisphereLight(0xd9f1ef,0x3c3528,2.8));
    const pl=new THREE.DirectionalLight(0xffffff,4);pl.position.set(1,3,3);this.previewScene.add(pl);
    const rim=new THREE.DirectionalLight(0xd1fa77,2);rim.position.set(-3,1,-2);this.previewScene.add(rim);
    this.previewCamera.position.set(2.2,.8,2.5);this.previewCamera.lookAt(0,0,0);
    void loadModelKit();
    addEventListener('resize',()=>this.resize()); this.resize();
  }
  resize() {
    this.renderer.setSize(innerWidth,innerHeight,false);
    this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();
    this.viewCamera.aspect=innerWidth/innerHeight;this.viewCamera.updateProjectionMatrix();
    if(this.previewRenderer){const c=this.previewRenderer.domElement;const w=c.clientWidth,h=c.clientHeight;if(w&&h){this.previewRenderer.setSize(w,h,false);this.previewCamera.aspect=w/h;this.previewCamera.updateProjectionMatrix();}}
  }
  setMap(id:MapId){
    if(id===this.mapId)return;
    this.world.dispose();this.mapId=id;this.world=buildWorld(this.scene,getMap(id));
    for(const effect of this.effects){this.scene.remove(effect.object);this.disposeObject(effect.object);}this.effects=[];
    this.setObjectives([],this.objectiveSelf);
  }
  setObjectives(flags:FlagState[],selfId:string){
    this.objectiveSelf=selfId;
    for(const [team,objects]of this.objectives)if(!flags.some(f=>f.team===team)){
      this.scene.remove(objects.base,objects.flag);this.disposeObject(objects.base);this.disposeObject(objects.flag);this.objectives.delete(team);
    }
    for(const state of flags){
      let entry=this.objectives.get(state.team);
      if(!entry){
        const color=state.team==='red'?0xeb6357:0x579fec;
        const base=new THREE.Group(),flag=new THREE.Group();
        const baseMaterial=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.18,roughness:.65,metalness:.25});
        const ring=new THREE.Mesh(new THREE.TorusGeometry(1.08,.035,6,36),baseMaterial);ring.rotation.x=-Math.PI/2;ring.position.y=.04;base.add(ring);
        const pad=new THREE.Mesh(new THREE.CylinderGeometry(.32,.41,.09,12),new THREE.MeshStandardMaterial({color:0x454e48,metalness:.65,roughness:.58}));pad.position.y=.045;base.add(pad);
        const pole=new THREE.Mesh(new THREE.CylinderGeometry(.022,.028,1.85,8),new THREE.MeshStandardMaterial({color:0xced5cf,metalness:.8,roughness:.34}));pole.position.y=.94;flag.add(pole);
        const cloth=new THREE.Mesh(new THREE.PlaneGeometry(.78,.48,8,3),new THREE.MeshStandardMaterial({color,roughness:.84,side:THREE.DoubleSide}));cloth.name='cloth';cloth.position.set(.4,1.56,0);flag.add(cloth);
        const insignia=new THREE.Mesh(new THREE.PlaneGeometry(.18,.18),new THREE.MeshStandardMaterial({color:0xf3eddb,side:THREE.DoubleSide}));insignia.rotation.z=Math.PI/4;insignia.position.set(.27,1.56,.012);flag.add(insignia);
        flag.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});this.scene.add(base,flag);
        entry={base,flag,state};this.objectives.set(state.team,entry);
      }
      entry.state=state;entry.base.position.set(state.home.x,state.home.y,state.home.z);
      entry.flag.visible=state.carrier!==selfId;
      entry.flag.position.set(state.position.x,state.position.y,state.position.z);
    }
  }
  setQuality(q:'high'|'low') { this.quality=q;this.renderer.setPixelRatio(q==='low'?1:Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=q==='high';this.resize(); }
  setWeapon(id:WeaponId){
    if(id===this.gunId)return;
    if(this.gun){this.viewScene.remove(this.gun);this.disposeObject(this.gun);}
    this.gun=buildWeapon(id);this.viewScene.add(this.gun);this.gunId=id;this.kick=0;this.weaponSwap=1;
  }
  preview(id:WeaponId,canvas:HTMLCanvasElement){
    if(!this.previewRenderer){this.previewRenderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});this.previewRenderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.previewRenderer.toneMapping=THREE.ACESFilmicToneMapping;this.previewRenderer.toneMappingExposure=1.2;const pmrem=new THREE.PMREMGenerator(this.previewRenderer);const studio=new RoomEnvironment();this.previewScene.environment=pmrem.fromScene(studio,.05).texture;this.previewScene.environmentIntensity=.8;studio.dispose();pmrem.dispose();}
    if(this.previewModel){this.previewScene.remove(this.previewModel);this.disposeObject(this.previewModel);}
    this.previewModel=buildWeapon(id,false);
    const bounds=new THREE.Box3().setFromObject(this.previewModel);const size=bounds.getSize(new THREE.Vector3());const center=bounds.getCenter(new THREE.Vector3());
    this.previewModel.position.sub(center);const group=new THREE.Group();group.add(this.previewModel);group.scale.setScalar(3.7/Math.max(size.x,size.y,size.z));this.previewModel=group;this.previewScene.add(group);this.resize();
  }
  shot(){this.kick=.11;this.flashUntil=performance.now()/1000+.045;}
  tracer(from:Vec3,to:Vec3,time:number){
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x,from.y,from.z),new THREE.Vector3(to.x,to.y,to.z)]);
    const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xffdf9b,transparent:true,opacity:.68}));this.scene.add(line);this.effects.push({object:line,until:time+.055});
    const spark=new THREE.Mesh(new THREE.SphereGeometry(.035,5,4),new THREE.MeshBasicMaterial({color:0xffecb4}));spark.position.set(to.x,to.y,to.z);this.scene.add(spark);this.effects.push({object:spark,until:time+.08});
  }
  draw(time:number,dt:number,body:Body|undefined,yaw:number,pitch:number,playing:boolean,ads:boolean,sprint:boolean,reloading:number,alive:boolean,players:PlayerState[],selfId:string,correction:THREE.Vector3,showPreview:boolean){
    this.renderer.info.reset();
    this.world.update(time);
    for(const e of this.effects)if(e.until<time){this.scene.remove(e.object);this.disposeObject(e.object);}this.effects=this.effects.filter(e=>e.until>=time);
    const ids=new Set(players.map(p=>p.id)),ownTeam=players.find(p=>p.id===selfId)?.team;
    for(const [id,model]of this.soldiers)if(!ids.has(id)){this.scene.remove(model);this.disposeObject(model);this.soldiers.delete(id);}
    for(const p of players){
      if(p.id===selfId)continue;
      let model=this.soldiers.get(p.id);
      const distance=body?Math.hypot(p.body.x-body.x,p.body.z-body.z):30;
      const lowDetail=distance>(model?.userData.lowDetail?10:14);
      if(model&&model.userData.lowDetail!==lowDetail){this.scene.remove(model);this.disposeObject(model);this.soldiers.delete(p.id);model=undefined;}
      if(!model){model=buildSoldier(p.bot?0x6c715b:0x536759,false,lowDetail);this.soldiers.set(p.id,model);this.scene.add(model);}
      const shadows=this.quality==='high'&&distance<20;
      if(model.userData.shadows!==shadows){model.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=shadows;});model.userData.shadows=shadows;}
      model.visible=playing&&p.hp>0;if(!model.visible)continue;
      model.position.set(p.body.x,p.body.y,p.body.z);model.rotation.y=p.body.yaw;
      setSoldierTeam(model,p.team??null,!!ownTeam&&p.team===ownTeam);poseSoldier(model,p.body,time,dt);
      const equipped=weaponForSlot(p.loadout,p.slot),anchor=model.getObjectByName('weaponAnchor')!;
      if(model.userData.weapon!==equipped){const old=anchor.getObjectByName('heldWeapon');if(old){anchor.remove(old);this.disposeObject(old);}const held=buildWeapon(equipped,false,lowDetail);held.name='heldWeapon';held.scale.setScalar(.86);held.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=shadows;});anchor.add(held);model.userData.weapon=equipped;}
    }
    for(const {flag,base,state}of this.objectives.values()){
      base.visible=playing;flag.visible=playing&&state.carrier!==this.objectiveSelf;
      const carrier=state.carrier?players.find(p=>p.id===state.carrier):undefined;
      if(carrier){flag.position.set(carrier.body.x,carrier.body.y+.3,carrier.body.z);flag.rotation.y=carrier.body.yaw;flag.rotation.z=.15;}
      else {flag.position.set(state.position.x,state.position.y,state.position.z);flag.rotation.set(0,0,0);}
      const cloth=flag.getObjectByName('cloth') as THREE.Mesh;
      const positions=cloth.geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++){const x=positions.getX(i);positions.setZ(i,Math.sin(time*4-x*8)*.045*(x+.4));}positions.needsUpdate=true;
    }
    this.localBody.visible=playing&&alive&&!!body;
    if(playing&&body){
      if(body.grounded&&!this.lastGrounded)this.landing=Math.min(.105,Math.abs(this.lastVelocityY)*.007);
      this.lastGrounded=body.grounded;this.lastVelocityY=body.vy;
      this.landing=THREE.MathUtils.damp(this.landing,0,12,dt);
      this.eye=THREE.MathUtils.damp(this.eye,alive?eyeHeight(body):.42,18,dt);
      this.slideBlend=THREE.MathUtils.damp(this.slideBlend,body.stance==='slide'?1:0,15,dt);
      const speed=Math.hypot(body.vx,body.vz),running=sprint&&body.stance==='stand'&&speed>6;
      this.movementPhase+=dt*speed*(running?2.2:2);
      const bob=body.grounded&&alive?Math.sin(this.movementPhase*2)*Math.min(.023,speed*.003)*(1-this.ads*.85)*(1-this.slideBlend):0;
      this.camera.position.set(body.x+correction.x,body.y+this.eye+bob-this.landing+correction.y,body.z+correction.z);
      this.camera.rotation.set(pitch+(alive?-this.landing*.2:-.18),yaw,alive?this.slideBlend*.045:.12,'YXZ');
      this.localBody.position.set(body.x+correction.x,body.y+correction.y,body.z+correction.z);this.localBody.rotation.y=yaw;
      poseSoldier(this.localBody,body,time,dt,true);
      const adsDuration=this.gunId?WEAPONS[this.gunId].adsTime:.18;
      this.ads=THREE.MathUtils.clamp(this.ads+(ads&&alive?dt/Math.max(.01,adsDuration):-dt/.12),0,1);
      const targetFov=this.fov+(running?7:0)+this.slideBlend*5;
      const desiredFov=THREE.MathUtils.lerp(targetFov,this.gunId==='intervention'?17:this.fov*.72,this.ads);
      this.camera.fov=THREE.MathUtils.damp(this.camera.fov,desiredFov,17,dt);this.camera.updateProjectionMatrix();
      this.kick=THREE.MathUtils.damp(this.kick,0,13,dt);this.weaponSwap=THREE.MathUtils.damp(this.weaponSwap,0,15,dt);
      const turn=THREE.MathUtils.euclideanModulo(yaw-this.lastYaw+Math.PI,Math.PI*2)-Math.PI;
      this.sway.x=THREE.MathUtils.damp(this.sway.x,THREE.MathUtils.clamp(turn,-.06,.06),12,dt);
      this.sway.y=THREE.MathUtils.damp(this.sway.y,THREE.MathUtils.clamp(pitch-this.lastPitch,-.04,.04),12,dt);this.lastYaw=yaw;this.lastPitch=pitch;
      if(this.gun){
        this.gun.visible=alive&&!(this.gunId==='intervention'&&this.ads>=.999);
        const aimY=-WEAPON_VIEW[this.gunId!].sight;
        const run=running?1:0,wave=Math.sin(this.movementPhase)*Math.min(.012,speed*.0017)*(1-this.slideBlend);
        const reload=Math.sin(reloading*Math.PI),hip=1-this.ads;
        this.gun.position.set(THREE.MathUtils.lerp(.20,0,this.ads)+(wave-this.sway.x*.45)*hip,THREE.MathUtils.lerp(-.205,aimY,this.ads)-Math.abs(wave)*hip-reload*.13-this.weaponSwap*.35-this.slideBlend*.025,THREE.MathUtils.lerp(-.60,-.36,this.ads)+this.kick+reload*.11+this.weaponSwap*.14);
        this.gun.rotation.set(this.kick*.75+run*.19+reload*.34+this.sway.y*.6+this.weaponSwap*.45,hip*.22-run*.28+reload*.16-this.sway.x*.5,run*-.16-reload*.56-this.slideBlend*.1);
        poseViewmodelArms(this.gun,reloading);
        if(this.gunId==='knife'&&this.kick>.005){this.gun.rotation.z-=this.kick*8;this.gun.position.z-=this.kick*2;}
      }
      this.flash.visible=alive&&this.gunId!=='knife'&&time<this.flashUntil&&this.ads<.9;
      this.flash.rotation.z=Math.random()*Math.PI;
      if(this.gun){const muzzle=WEAPON_VIEW[this.gunId!].muzzle;this.flash.position.set(...muzzle).applyEuler(this.gun.rotation).add(this.gun.position);}
    }else{
      this.camera.fov=53;this.camera.updateProjectionMatrix();
      const a=.66+Math.sin(time*.025)*.1;this.camera.position.set(Math.sin(a)*44,20+Math.sin(time*.1)*.5,Math.cos(a)*44);this.camera.lookAt(-3,4,0);this.flash.visible=false;
    }
    this.viewLighting.update(this.world.lighting,this.camera,dt);
    this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);
    if(playing&&alive){this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.viewScene,this.viewCamera);this.renderer.autoClear=true;}
    if(showPreview&&this.previewModel&&this.previewRenderer){this.previewModel.rotation.y=-.85+Math.sin(time*.4)*.075;this.previewModel.rotation.z=-.08;this.previewRenderer.render(this.previewScene,this.previewCamera);}
  }
  private disposeObject(o:THREE.Object3D){
    releaseModel(o);const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    o.traverse(child=>{const m=child as THREE.Mesh;if(m instanceof THREE.SkinnedMesh)m.skeleton.dispose();if(m.geometry&&!m.geometry.userData.shared)geometries.add(m.geometry);if(m.material)for(const mat of(Array.isArray(m.material)?m.material:[m.material]))materials.add(mat);});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
}
