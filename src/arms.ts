import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { WeaponId } from '../shared/types';

type ArmPose = {
  shoulder: number[];
  elbow: number[];
  wrist: number[];
  upperLength: number;
  foreLength: number;
  bones: string[];
};
type ArmState = {
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  wrist: THREE.Vector3;
  pole: THREE.Vector3;
  upperDirection: THREE.Vector3;
  foreDirection: THREE.Vector3;
  upperLength: number;
  foreLength: number;
  bones: THREE.Bone[];
  rotations: THREE.Quaternion[];
};

let asset: THREE.Group | undefined;
let loading: Promise<void> | undefined;
const waiting = new Map<THREE.Object3D, WeaponId>();
const instances = new WeakMap<THREE.Object3D, ArmState>();
const loaded = new WeakSet<THREE.Object3D>();

/** One shared download contains authored grips and six skin bones per arm pair. */
export function loadViewmodelArms(): Promise<void> {
  if (!loading) loading = new GLTFLoader().loadAsync('/models/viewmodel-arms.glb').then(gltf => {
    asset = gltf.scene;
    asset.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.userData.shared = true;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial && material.map) {
            material.map.anisotropy = 4;
          }
        }
      }
    });
    for (const [container, id] of waiting) install(container, id);
  }).catch(error => {
    loading = undefined;
    throw error;
  });
  return loading;
}

/** Attach after weapon batching: the anatomical surface retains its skin rig. */
export function attachViewmodelArms(container: THREE.Object3D, id: WeaponId): void {
  if (loaded.has(container)) return;
  waiting.set(container, id);
  if (asset) install(container, id);
  else void loadViewmodelArms().catch(() => {
    waiting.delete(container);
    console.warn('Viewmodel arms unavailable.');
  });
}

function install(container: THREE.Object3D, id: WeaponId): void {
  if (loaded.has(container)) return;
  const source = asset?.getObjectByName('arms_' + id);
  if (!source) return;
  const model = cloneSkeleton(source);
  model.name = 'viewmodelArms';
  const ownMaterials = new Map<THREE.Material, THREE.Material>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
    const own = (material: THREE.Material) => {
      let copy = ownMaterials.get(material);
      if (!copy) { copy = material.clone(); ownMaterials.set(material, copy); }
      return copy;
    };
    object.material = Array.isArray(object.material) ? object.material.map(own) : own(object.material);
  });
  container.add(model);
  loaded.add(container);
  waiting.delete(container);
  const pose = (source.userData.armPose as Record<string, ArmPose> | undefined)?.left;
  if (!pose) return;
  const shoulder = new THREE.Vector3().fromArray(pose.shoulder);
  const elbow = new THREE.Vector3().fromArray(pose.elbow);
  const wrist = new THREE.Vector3().fromArray(pose.wrist);
  const direction = wrist.clone().sub(shoulder).normalize();
  const pole = elbow.clone().sub(shoulder);
  pole.addScaledVector(direction, -pole.dot(direction)).normalize();
  const bones = pose.bones.map(name => model.getObjectByName(name) as THREE.Bone);
  if (bones.some(bone => !bone?.isBone)) return;
  instances.set(container, {
    shoulder, elbow, wrist, pole,
    upperDirection: elbow.clone().sub(shoulder).normalize(),
    foreDirection: wrist.clone().sub(elbow).normalize(),
    upperLength: pose.upperLength,
    foreLength: pose.foreLength,
    bones,
    rotations: bones.map(bone => bone.quaternion.clone()),
  });
}

const target = new THREE.Vector3();
const direction = new THREE.Vector3();
const bend = new THREE.Vector3();
const elbow = new THREE.Vector3();
const segment = new THREE.Vector3();
const turn = new THREE.Quaternion();
const xAxis = new THREE.Vector3(1, 0, 0);
const reloadPole = new THREE.Vector3(0, -1, .05).normalize();

/** Move the support wrist during reload; the elbow bends and shoulder stays put. */
export function poseViewmodelArms(container: THREE.Object3D, reloadProgress: number): void {
  const arm = instances.get(container);
  if (!arm) return;
  const amount = Math.sin(THREE.MathUtils.clamp(reloadProgress, 0, 1) * Math.PI);
  target.copy(arm.wrist);target.y -= amount * .10;target.z += amount * .13;
  direction.copy(target).sub(arm.shoulder);
  const distance = THREE.MathUtils.clamp(direction.length(), .03, arm.upperLength + arm.foreLength - .00001);
  direction.normalize();target.copy(arm.shoulder).addScaledVector(direction, distance);
  const along = (arm.upperLength ** 2 - arm.foreLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, arm.upperLength ** 2 - along ** 2));
  bend.copy(arm.pole).lerp(reloadPole, amount * .9);
  bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  elbow.copy(arm.shoulder).addScaledVector(direction, along).addScaledVector(bend, height);
  arm.bones[0].position.copy(arm.shoulder);
  segment.copy(elbow).sub(arm.shoulder).normalize();
  turn.setFromUnitVectors(arm.upperDirection, segment);
  arm.bones[0].quaternion.copy(turn).multiply(arm.rotations[0]);
  arm.bones[1].position.copy(elbow);
  segment.copy(target).sub(elbow).normalize();
  turn.setFromUnitVectors(arm.foreDirection, segment);
  arm.bones[1].quaternion.copy(turn).multiply(arm.rotations[1]);
  arm.bones[2].position.copy(target);
  turn.setFromAxisAngle(xAxis, amount * .7);
  arm.bones[2].quaternion.copy(turn).multiply(arm.rotations[2]);
}

export function releaseViewmodelArms(object: THREE.Object3D): void {
  object.traverse(child => { waiting.delete(child); instances.delete(child); loaded.delete(child); });
}
