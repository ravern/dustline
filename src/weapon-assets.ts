import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { WeaponId } from '../shared/types';


/** Authored barrel and sight lines in weapon-local metres. */
export const WEAPON_VIEW: Record<WeaponId, {sight: number; muzzle: readonly [number, number, number]}> = {
  ak47: {sight: .022, muzzle: [0, -.035, -.701]},
  scar: {sight: .0944, muzzle: [0, .0056, -.696]},
  intervention: {sight: .127, muzzle: [0, .018, -.906]},
  m9: {sight: -.006, muzzle: [0, -.023, -.144]},
  knife: {sight: 0, muzzle: [0, -.019, -.263]},
};

const loader = new GLTFLoader();
const assets = new Map<WeaponId, Promise<THREE.Group>>();
const ready = new Map<WeaponId, THREE.Group>();
const waiting = new Map<THREE.Group, WeaponId>();

function cloneModel(source: THREE.Group): THREE.Group {
  const clone = source.clone(true);
  const materials = new Map<THREE.Material, THREE.Material>();
  clone.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const own = (material: THREE.Material) => {
      let copy = materials.get(material);
      if (!copy) { copy = material.clone(); materials.set(material, copy); }
      return copy;
    };
    object.material = Array.isArray(object.material) ? object.material.map(own) : own(object.material);
  });
  return clone;
}

function install(target: THREE.Group, source: THREE.Group) {
  // Fallback geometry belongs to the template cache; only its material copies are owned here.
  const fallback = target.getObjectByName('weaponFallback');
  if (fallback) {
    const materials = new Set<THREE.Material>();
    fallback.traverse(object => {
      if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    materials.forEach(material => material.dispose());
    target.remove(fallback);
  }
  const model = cloneModel(source);
  model.name = 'weaponAsset';
  target.add(model);
  target.userData.detailedWeapon = true;
  waiting.delete(target);
}

export function loadWeaponAsset(id: WeaponId): Promise<THREE.Group> {
  let pending = assets.get(id);
  if (!pending) {
    pending = loader.loadAsync(`/models/weapons/${id}.glb`).then(({scene}) => {
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.userData.shared = true;
        object.castShadow = object.receiveShadow = true;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial) {
            for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) if (texture) texture.anisotropy = 4;
          }
        }
      });
      ready.set(id, scene);
      for (const [target, requested] of waiting) if (requested === id) install(target, scene);
      return scene;
    }).catch(error => {
      assets.delete(id);
      throw error;
    });
    assets.set(id, pending);
  }
  return pending;
}

export function attachWeaponAsset(target: THREE.Group, id: WeaponId) {
  const source = ready.get(id);
  if (source) install(target, source);
  else {
    waiting.set(target, id);
    void loadWeaponAsset(id).catch(() => {
      waiting.delete(target);
      console.warn(`Weapon asset unavailable: ${id}`);
    });
  }
}

export function releaseWeaponAsset(object: THREE.Object3D) {
  object.traverse(child => { if (child instanceof THREE.Group) waiting.delete(child); });
}

export function loadWeaponAssets() {
  return Promise.all((['intervention', 'ak47', 'scar', 'm9', 'knife'] as WeaponId[]).map(loadWeaponAsset));
}
