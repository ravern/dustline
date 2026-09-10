import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const details=new Map<string,THREE.CanvasTexture>();
/** Small shared procedural grain avoids large texture downloads and preserves readable silhouettes. */
export function applySurfaceDetail(material:THREE.MeshStandardMaterial,kind:'weave'|'suede'|'leather'){
  if(typeof document==='undefined')return;
  let texture=details.get(kind);
  if(!texture){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const context=canvas.getContext('2d')!,pixels=context.createImageData(128,128);
    let seed=8129;for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=(seed>>>24)/255;
      const thread=kind==='weave'?((x%4<2)===(y%4<2)?12:-12):kind==='leather'?Math.sin(x*.9+y*.4)*6:0;
      const value=Math.max(0,Math.min(255,218+thread+noise*31));const i=(y*128+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;
    }
    context.putImageData(pixels,0,0);texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,3);texture.anisotropy=4;details.set(kind,texture);
  }
  material.map=texture;material.bumpMap=texture;material.bumpScale=kind==='weave'?.0012:.0007;material.roughnessMap=texture;material.roughness=.96;
}
let kit:THREE.Group|undefined;
let pending:Promise<THREE.Group>|undefined;
/** One compact, Blender-authored kit is shared by viewmodels, actors and instanced map props. */
export function loadAssetKit():Promise<THREE.Group>{
  if(!pending)pending=new GLTFLoader().loadAsync('/models/dustline-kit.glb').then(gltf=>{
    kit=gltf.scene;
    kit.traverse(object=>{
      if(object instanceof THREE.Mesh){
        object.castShadow=true;object.receiveShadow=true;object.geometry.userData.shared=true;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          material.userData.shared=true;
          if(material instanceof THREE.MeshStandardMaterial){
            if(/nylon|stitching/i.test(material.name))applySurfaceDetail(material,'weave');
            else if(/suede/i.test(material.name))applySurfaceDetail(material,'suede');
            else if(/rubber/i.test(material.name))applySurfaceDetail(material,'leather');
          }
        }
      }
    });
    return kit;
  });
  return pending;
}
/** Call after loadAssetKit resolves. Geometry is shared; callers own their cloned materials. */
export function cloneKitModel(name:string):THREE.Object3D|undefined{
  const source=kit?.getObjectByName(name);if(!source)return;
  const clone=source.clone(true),materials=new Map<THREE.Material,THREE.Material>();
  const own=(material:THREE.Material)=>{let result=materials.get(material);if(!result){result=material.clone();result.userData.shared=false;materials.set(material,result);}return result;};
  clone.traverse(object=>{if(object instanceof THREE.Mesh)object.material=Array.isArray(object.material)?object.material.map(own):own(object.material);});
  return clone;
}
