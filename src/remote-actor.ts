import * as THREE from 'three';
import {buildSoldier,buildWeapon,soldierWeaponAnchor} from './models';
import type {WeaponId} from '../shared/types';

/** Screen size, rather than world distance alone, preserves detail in scopes. */
export function useDistantActor(distance:number,currentLow:boolean,quality:'high'|'low',fov:number):boolean{
  const screenDistance=distance*Math.tan(THREE.MathUtils.degToRad(fov)*.5)/Math.tan(THREE.MathUtils.degToRad(82)*.5);
  return screenDistance>(quality==='low'?(currentLow?5:8):(currentLow?10:14));
}

type Variant={model:THREE.Group;weapons:Map<WeaponId,THREE.Group>};
/** Variants are lazy and detached when inactive. Crossing the LOD boundary
 * changes a reference, not geometry buffers, shader materials or skeletons. */
export class RemoteActor{
  readonly variants=new Map<boolean,Variant>();
  current?:THREE.Group;
  constructor(private color:number){}
  select(low:boolean):THREE.Group{
    let variant=this.variants.get(low);
    if(!variant){variant={model:buildSoldier(this.color,false,low),weapons:new Map()};this.variants.set(low,variant);}
    const next=variant.model,previous=this.current;
    if(previous&&previous!==next){
      next.position.copy(previous.position);next.quaternion.copy(previous.quaternion);
      for(const key of ['stance','gait','air','wasGrounded','land'])next.userData[key]=previous.userData[key];
      next.userData.lastPose=undefined;
    }
    this.current=next;return next;
  }
  setWeapon(id:WeaponId):void{
    const model=this.current!;if(model.userData.weapon===id)return;
    const variant=this.variants.get(!!model.userData.lowDetail)!;
    const previous=variant.weapons.get(model.userData.weapon);if(previous)previous.visible=false;
    let held=variant.weapons.get(id);
    if(!held){
      held=buildWeapon(id,false,!!model.userData.lowDetail);held.name='heldWeapon';held.scale.setScalar(.86);
      held.userData.castShadow=!!model.userData.shadows;held.traverse(object=>{if(object instanceof THREE.Mesh)object.castShadow=!!model.userData.shadows;});
      soldierWeaponAnchor(model).add(held);variant.weapons.set(id,held);
    }
    held.visible=true;model.userData.weapon=id;
  }
  setShadows(enabled:boolean):void{
    const model=this.current!;if(model.userData.shadows===enabled)return;
    model.traverse(object=>{if(object instanceof THREE.Mesh)object.castShadow=enabled;});model.userData.shadows=enabled;
    for(const held of this.variants.get(!!model.userData.lowDetail)!.weapons.values())held.userData.castShadow=enabled;
  }
}
