import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld } from './world';
import { buildSoldier, buildWeapon } from './models';
import { eyeHeight } from '../shared/physics';
import { WEAPONS, weaponForSlot } from '../shared/weapons';
import type { Body, PlayerState, WeaponId, Vec3 } from '../shared/types';

export class GameView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(82, 1, .06, 280);
  viewScene = new THREE.Scene();
  viewCamera = new THREE.PerspectiveCamera(65, 1, .015, 20);
  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(35, 1, .01, 20);
  previewRenderer?: THREE.WebGLRenderer;
  previewModel?: THREE.Group;
  soldiers = new Map<string, THREE.Group>();
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
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.world = buildWorld(this.scene);
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    const studio=new RoomEnvironment();
    const environment=pmrem.fromScene(studio,.05).texture;
    this.viewScene.environment=environment;this.viewScene.environmentIntensity=.65;

    studio.dispose();pmrem.dispose();
    this.camera.rotation.order = 'YXZ';
    this.viewScene.add(new THREE.HemisphereLight(0xfff4d9, 0x353b38, 2.4));
    const sun = new THREE.DirectionalLight(0xffdfa9, 3.2); sun.position.set(-3, 5, 3); this.viewScene.add(sun);
    const fill = new THREE.DirectionalLight(0x91b9cb, 1.5); fill.position.set(3, 1, -3); this.viewScene.add(fill);
    this.viewScene.add(this.flash);
    const fm = new THREE.MeshBasicMaterial({color:0xffd386,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide});
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(.17,.28), fm); m.rotation.z=i*Math.PI/3; this.flash.add(m); }
    this.flash.position.set(.29,-.22,-1.35); this.flash.visible = false;
    this.previewScene.add(new THREE.HemisphereLight(0xd9f1ef,0x3c3528,2.8));
    const pl=new THREE.DirectionalLight(0xffffff,4);pl.position.set(1,3,3);this.previewScene.add(pl);
    const rim=new THREE.DirectionalLight(0xd1fa77,2);rim.position.set(-3,1,-2);this.previewScene.add(rim);
    this.previewCamera.position.set(2.2,.8,2.5);this.previewCamera.lookAt(0,0,0);
    addEventListener('resize',()=>this.resize()); this.resize();
  }
  resize() {
    this.renderer.setSize(innerWidth,innerHeight,false);
    this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();
    this.viewCamera.aspect=innerWidth/innerHeight;this.viewCamera.updateProjectionMatrix();
    if(this.previewRenderer){const c=this.previewRenderer.domElement;const w=c.clientWidth,h=c.clientHeight;if(w&&h){this.previewRenderer.setSize(w,h,false);this.previewCamera.aspect=w/h;this.previewCamera.updateProjectionMatrix();}}
  }
  setQuality(q:'high'|'low') { this.quality=q;this.renderer.setPixelRatio(q==='low'?1:Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=q==='high';this.resize(); }
  setWeapon(id:WeaponId){
    if(id===this.gunId)return;
    if(this.gun){this.viewScene.remove(this.gun);this.disposeObject(this.gun);}
    this.gun=buildWeapon(id);this.viewScene.add(this.gun);this.gunId=id;this.kick=0;
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
    const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xffdf9b,transparent:true,opacity:.75}));this.scene.add(line);this.effects.push({object:line,until:time+.07});
    const spark=new THREE.Mesh(new THREE.SphereGeometry(.045,5,4),new THREE.MeshBasicMaterial({color:0xffecb4}));spark.position.set(to.x,to.y,to.z);this.scene.add(spark);this.effects.push({object:spark,until:time+.1});
  }
  draw(time:number,dt:number,body:Body|undefined,yaw:number,pitch:number,playing:boolean,ads:boolean,sprint:boolean,reloading:number,alive:boolean,players:PlayerState[],selfId:string,correction:THREE.Vector3,showPreview:boolean){
    this.world.update(time);
    for(const e of this.effects){if(e.until<time){this.scene.remove(e.object);this.disposeObject(e.object);}}this.effects=this.effects.filter(e=>e.until>=time);
    const ids=new Set(players.map(p=>p.id));
    for(const [id,model]of this.soldiers)if(!ids.has(id)){this.scene.remove(model);this.disposeObject(model);this.soldiers.delete(id);}
    for(const p of players){if(p.id===selfId)continue;let model=this.soldiers.get(p.id);if(!model){model=buildSoldier(p.bot?0x5b6250:0x455a58);this.soldiers.set(p.id,model);this.scene.add(model);}model.visible=playing&&p.hp>0;if(!model.visible)continue;model.position.set(p.body.x,p.body.y,p.body.z);model.rotation.y=p.body.yaw;
      const equipped=weaponForSlot(p.loadout,p.slot);
      if(model.userData.weapon!==equipped){const old=model.getObjectByName('heldWeapon');if(old){model.remove(old);this.disposeObject(old);}const held=buildWeapon(equipped,false);held.name='heldWeapon';held.position.set(.05,1.15,-.38);held.scale.setScalar(.82);model.add(held);model.userData.weapon=equipped;}
      const crouch=p.body.stance!=='stand';model.scale.y=crouch?.63:1;
      const speed=Math.hypot(p.body.vx,p.body.vz);const gait=Math.sin(time*(speed>7?15:10))*Math.min(.55,speed*.07);
      const l=model.getObjectByName('leftLeg'),r=model.getObjectByName('rightLeg');if(l)l.rotation.x=gait;if(r)r.rotation.x=-gait;
    }
    if(playing&&body){
      this.eye=THREE.MathUtils.damp(this.eye,alive?eyeHeight(body):.42,16,dt);
      const speed=Math.hypot(body.vx,body.vz);
      const bob=body.grounded&&alive?Math.sin(time*(sprint?17:12))*Math.min(.028,speed*.004)*(1-this.ads*.8):0;
      this.camera.position.set(body.x+correction.x,body.y+this.eye+bob+correction.y,body.z+correction.z);
      this.camera.rotation.set(pitch+(alive?0:-.18),yaw,alive?(body.stance==='slide'?.035:0):.12,'YXZ');
      const adsDuration=this.gunId?WEAPONS[this.gunId].adsTime:.18;
      this.ads=THREE.MathUtils.clamp(this.ads+(ads&&alive?dt/Math.max(.01,adsDuration):-dt/.12),0,1);
      const targetFov=this.fov+(sprint?8:0)+(body.stance==='slide'?5:0);
      this.camera.fov=THREE.MathUtils.lerp(targetFov,this.gunId==='intervention'?17:this.fov*.72,this.ads);this.camera.updateProjectionMatrix();
      this.kick=THREE.MathUtils.damp(this.kick,0,13,dt);
      if(this.gun){
        this.gun.visible=alive&&!(this.gunId==='intervention'&&this.ads>=.999);
        const aimY=this.gunId==='intervention'?-.187:this.gunId==='ak47'?-.15:this.gunId==='scar'?-.177:-.105;
        const run=sprint?1:0;const wave=Math.sin(time*14)*Math.min(.013,speed*.002);
        this.gun.position.set(THREE.MathUtils.lerp(.28,0,this.ads)+wave*(1-this.ads),THREE.MathUtils.lerp(-.29,aimY,this.ads)-Math.abs(wave)*(1-this.ads)-Math.sin(reloading*Math.PI)*.22,-.46+this.kick+Math.sin(reloading*Math.PI)*.15);
        this.gun.rotation.set(this.kick*.75+run*.22+Math.sin(reloading*Math.PI)*.5,-run*.3,run*-.2+Math.sin(reloading*Math.PI)*-.45);
        if(this.gunId==='knife'&&this.kick>.005){this.gun.rotation.z-=this.kick*8;this.gun.position.z-=this.kick*2;}
      }
      this.flash.visible=alive&&this.gunId!=='knife'&&time<this.flashUntil&&this.ads<.9;
      this.flash.rotation.z=Math.random()*Math.PI;
      this.flash.position.x=THREE.MathUtils.lerp(.28,0,this.ads);
    }else{
      this.camera.fov=53;this.camera.updateProjectionMatrix();
      const a=.66+Math.sin(time*.025)*.1;this.camera.position.set(Math.sin(a)*44,20+Math.sin(time*.1)*.5,Math.cos(a)*44);this.camera.lookAt(-3,4,0);this.flash.visible=false;
    }
    this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);
    if(playing&&alive){this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.viewScene,this.viewCamera);this.renderer.autoClear=true;}
    if(showPreview&&this.previewModel&&this.previewRenderer){this.previewModel.rotation.y=-.85+Math.sin(time*.4)*.075;this.previewModel.rotation.z=-.08;this.previewRenderer.render(this.previewScene,this.previewCamera);}
  }
  private disposeObject(o:THREE.Object3D){o.traverse(child=>{const m=child as THREE.Mesh;if(m.geometry)m.geometry.dispose();if(m.material){for(const mat of(Array.isArray(m.material)?m.material:[m.material]))mat.dispose();}});}
}
