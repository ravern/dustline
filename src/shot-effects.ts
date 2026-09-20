import * as THREE from 'three';
import type {Vec3} from '../shared/types';

type Shot={root:THREE.Group;line:THREE.Line;spark:THREE.Mesh;until:number;lineUntil:number};

/** Shots reuse their six-position buffer and GPU materials after the first burst. */
export class ShotEffects{
  private active:Shot[]=[];
  private available:Shot[]=[];
  private lineMaterial=new THREE.LineBasicMaterial({color:0xffdf9b,transparent:true,opacity:.68});
  private sparkMaterial=new THREE.MeshBasicMaterial({color:0xffecb4});
  private sparkGeometry=new THREE.SphereGeometry(.035,5,4);
  constructor(private scene:THREE.Scene){}
  get count(){return this.active.length;}
  spawn(from:Vec3,to:Vec3,time:number,spark:boolean):void{
    if(this.active.length>=(spark?32:16))return;
    let shot=this.available.pop();
    if(!shot){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3).setUsage(THREE.DynamicDrawUsage));
      const line=new THREE.Line(geometry,this.lineMaterial),impact=new THREE.Mesh(this.sparkGeometry,this.sparkMaterial),root=new THREE.Group();root.add(line,impact);
      shot={root,line,spark:impact,until:0,lineUntil:0};
    }
    const positions=shot.line.geometry.attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0,from.x,from.y,from.z);positions.setXYZ(1,to.x,to.y,to.z);positions.needsUpdate=true;shot.line.geometry.computeBoundingSphere();
    shot.line.visible=true;shot.spark.visible=spark;shot.spark.position.set(to.x,to.y,to.z);shot.lineUntil=time+.055;shot.until=time+(spark?.08:.055);
    this.active.push(shot);this.scene.add(shot.root);
  }
  update(time:number):void{
    for(let i=this.active.length-1;i>=0;i--){const shot=this.active[i];if(time>=shot.until){this.scene.remove(shot.root);this.available.push(shot);this.active[i]=this.active[this.active.length-1];this.active.pop();}else shot.line.visible=time<shot.lineUntil;}
  }
  clear():void{for(const shot of this.active){this.scene.remove(shot.root);this.available.push(shot);}this.active.length=0;}
}
