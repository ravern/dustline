import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPON_VIEW, loadWeaponAsset } from '../src/weapon-assets.ts';
import { loadViewmodelArms, poseViewmodelArms } from '../src/arms.ts';
import { buildWeapon } from '../src/models.ts';
import { GameView } from '../src/renderer.ts';
import type { WeaponId } from '../shared/types.ts';

const ids = Object.keys(WEAPON_VIEW) as WeaponId[];
function readGlb(relative: string) {
  const bytes = readFileSync(new URL('../public/models/' + relative, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + length));
  assert.equal(bytes.toString('ascii', 24 + length, 28 + length), 'BIN\0');
  const binary = bytes.subarray(28 + length);
  return { bytes, json, binary };
}
function imageSize(bytes: Buffer): [number, number] {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  assert.equal(bytes.readUInt16BE(0), 0xffd8, 'image must be embedded PNG or JPEG');
  for (let p = 2; p < bytes.length;) {
    if (bytes[p] !== 255) { p++; continue; }
    const marker = bytes[p + 1]; p += 2;
    if (marker === 216 || marker === 217) continue;
    if ([192, 193, 194].includes(marker)) return [bytes.readUInt16BE(p + 5), bytes.readUInt16BE(p + 3)];
    p += bytes.readUInt16BE(p);
  }
  throw new Error('JPEG has no frame header');
}
function values(glb: ReturnType<typeof readGlb>, index: number): number[] {
  const a = glb.json.accessors[index], b = glb.json.bufferViews[a.bufferView];
  const components: Record<string, number> = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16};
  const sizes: Record<number, number> = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4};
  const count = components[a.type], size = sizes[a.componentType];
  const data = new DataView(glb.binary.buffer, glb.binary.byteOffset, glb.binary.byteLength);
  const output: number[] = [];
  for (let i = 0; i < a.count; i++) for (let c = 0; c < count; c++) {
    const offset = (b.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (b.byteStride ?? count * size) + c * size;
    assert.ok(offset + size <= glb.binary.length, 'accessor exceeds its binary buffer');
    const value = a.componentType === 5126 ? data.getFloat32(offset, true) : a.componentType === 5125 ? data.getUint32(offset, true) : a.componentType === 5123 ? data.getUint16(offset, true) : a.componentType === 5122 ? data.getInt16(offset, true) : a.componentType === 5120 ? data.getInt8(offset) : data.getUint8(offset);
    assert.ok(Number.isFinite(value), 'geometry contains nonfinite values'); output.push(value);
  }
  return output;
}
function triangles(glb: ReturnType<typeof readGlb>, meshIndex: number): number {
  return glb.json.meshes[meshIndex].primitives.reduce((sum: number, p: any) => sum + glb.json.accessors[p.indices ?? p.attributes.POSITION].count / 3, 0);
}

for (const relative of [...ids.map(id => `weapons/${id}.glb`), 'viewmodel-arms.glb']) {
  test(`${relative} stays within browser budgets and has valid material UVs and skin data`, () => {
    const glb = readGlb(relative), g = glb.json;
    assert.ok(glb.bytes.length <= 2 * 1024 * 1024, `${relative} exceeds the 2 MiB download budget`);
    assert.ok(g.images.length > 0, 'detail must include real embedded texture pixels');
    for (const image of g.images) {
      assert.equal(image.uri, undefined, 'textures must not depend on external source-machine paths');
      const view = g.bufferViews[image.bufferView];
      const [width, height] = imageSize(glb.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
      assert.ok(width > 0 && height > 0 && width <= 1024 && height <= 1024, `${relative} has an oversized texture`);
    }
    for (const mesh of g.meshes) for (const primitive of mesh.primitives) {
      assert.equal(primitive.mode ?? 4, 4);
      const position = g.accessors[primitive.attributes.POSITION];
      assert.ok(position.count > 0); values(glb, primitive.attributes.POSITION);
      assert.equal(g.accessors[primitive.attributes.NORMAL].count, position.count);
      const normals = values(glb, primitive.attributes.NORMAL);
      for (let i = 0; i < normals.length; i += 3) {
        const length = Math.hypot(...normals.slice(i, i + 3)); assert.ok(length > .9 && length < 1.1, 'invalid surface normal');
      }
      if (primitive.indices !== undefined) for (const index of values(glb, primitive.indices)) assert.ok(index < position.count);
      const mat = g.materials[primitive.material], pbr = mat.pbrMetallicRoughness ?? {};
      for (const texture of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, mat.normalTexture, mat.occlusionTexture, mat.emissiveTexture].filter(Boolean)) {
        const name = 'TEXCOORD_' + (texture.texCoord ?? 0);
        assert.ok(primitive.attributes[name] !== undefined, `material refers to nonexistent ${name}`);
        assert.equal(g.accessors[primitive.attributes[name]].count, position.count); values(glb, primitive.attributes[name]);
        assert.ok(g.textures[texture.index]);
      }
    }
    if (relative.startsWith('weapons/')) {
      assert.ok(g.meshes.reduce((sum: number, _: unknown, index: number) => sum + triangles(glb, index), 0) <= 20000);
      assert.equal(g.skins?.length ?? 0, 0, 'rigid weapons should not create per-instance skeleton work');
    } else {
      for (const id of ids) {
        const root = g.nodes.findIndex((n: any) => n.name === 'arms_' + id); assert.ok(root >= 0);
        let total = 0, skinned = 0;
        function visit(index: number) {
          const node = g.nodes[index];
          if (node.mesh !== undefined) {
            total += triangles(glb, node.mesh); const skin = g.skins[node.skin]; assert.ok(skin, 'arm surface lost its rig'); skinned++;
            for (const p of g.meshes[node.mesh].primitives) {
              const weights = values(glb, p.attributes.WEIGHTS_0), joints = values(glb, p.attributes.JOINTS_0);
              for (const joint of joints) assert.ok(joint < skin.joints.length);
              for (let i = 0; i < weights.length; i += 4) assert.ok(Math.abs(weights.slice(i, i + 4).reduce((a, b) => a + b, 0) - 1) < .001);
            }
          }
          for (const child of node.children ?? []) visit(child);
        }
        visit(root); assert.ok(skinned > 0 && total > 1000 && total <= 10000, `${id} arm pose exceeds its budget`);
      }
    }
  });
}

async function parseScene(relative: string) {
  const {bytes} = readGlb(relative);
  const loader = new GLTFLoader();
  // Geometry, skins, materials and hierarchy use the production parser. Only
  // image decoding is replaced because these tests run without a browser DOM.
  loader.register(() => ({name: 'test_embedded_image_decoder', loadTexture: async () => new THREE.Texture()}));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
}
function meshIn(object: THREE.Object3D): THREE.Mesh {
  let result: THREE.Mesh | undefined;
  object.traverse(o => { if (!result && o instanceof THREE.Mesh) result = o; });
  assert.ok(result); return result;
}
function dispose(object: THREE.Object3D) {
  // Exercise production cleanup without constructing a WebGL renderer in Node.
  (GameView.prototype as unknown as {disposeObject(o: THREE.Object3D): void}).disposeObject(object);
}

test('authored muzzles and sight offsets remain aligned with exported weapon geometry', async () => {
  let download = 0;
  for (const id of ids) {
    download += readGlb(`weapons/${id}.glb`).bytes.length;
    const {scene} = await parseScene(`weapons/${id}.glb`); const bounds = new THREE.Box3().setFromObject(scene);
    const {muzzle, sight} = WEAPON_VIEW[id];
    assert.ok(Math.abs(muzzle[2] - bounds.min.z) < .02, `${id} muzzle flash is detached from barrel tip`);
    assert.ok(muzzle[0] >= bounds.min.x - .005 && muzzle[0] <= bounds.max.x + .005);
    assert.ok(muzzle[1] >= bounds.min.y && muzzle[1] <= bounds.max.y);
    assert.ok(sight > bounds.min.y && sight < bounds.max.y + .008);
  }
  assert.ok(download + readGlb('viewmodel-arms.glb').bytes.length < 6 * 1024 * 1024);
});

test('failed downloads retry, released targets stay released, and live clones own their rigs and materials', async t => {
  const calls = new Map<string, number>(); let resume!: () => void;
  const gate = new Promise<void>(resolve => { resume = resolve; });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url: string) => {
    const count = (calls.get(url) ?? 0) + 1; calls.set(url, count);
    if (count === 1) throw new Error('temporary asset transport failure');
    await gate;
    return parseScene(url.replace('/models/', ''));
  });
  await assert.rejects(loadWeaponAsset('ak47'), /temporary/);
  await assert.rejects(loadViewmodelArms(), /temporary/);
  const first = buildWeapon('ak47'), second = buildWeapon('ak47'), removed = buildWeapon('ak47');
  assert.ok(first.getObjectByName('weaponFallback'));
  dispose(removed); resume();
  const [source] = await Promise.all([loadWeaponAsset('ak47'), loadViewmodelArms()]);
  assert.equal(calls.get('/models/weapons/ak47.glb'), 2); assert.equal(calls.get('/models/viewmodel-arms.glb'), 2);
  assert.equal(first.getObjectByName('weaponFallback'), undefined);
  assert.equal(removed.getObjectByName('weaponAsset'), undefined); assert.equal(removed.getObjectByName('viewmodelArms'), undefined);
  const a = meshIn(first.getObjectByName('weaponAsset')!), b = meshIn(second.getObjectByName('weaponAsset')!), original = meshIn(source);
  assert.equal(a.geometry, b.geometry); assert.equal(a.geometry, original.geometry); assert.equal(a.geometry.userData.shared, true);
  assert.notEqual(a.material, b.material); assert.notEqual(a.material, original.material);
  const left = first.getObjectByName('ak47_left_hand')!, sibling = second.getObjectByName('ak47_left_hand')!;
  assert.ok(left instanceof THREE.Bone && sibling instanceof THREE.Bone); assert.notEqual(left, sibling);
  const neutral = sibling.position.clone(); poseViewmodelArms(first, .5);
  assert.ok(left.position.distanceTo(neutral) > .1); assert.deepEqual(sibling.position.toArray(), neutral.toArray());
  poseViewmodelArms(first, 0); assert.ok(left.position.distanceTo(neutral) < .0001);
  const rigA = meshIn(first.getObjectByName('viewmodelArms')!) as THREE.SkinnedMesh;
  const rigB = meshIn(second.getObjectByName('viewmodelArms')!) as THREE.SkinnedMesh;
  assert.notEqual(rigA.skeleton, rigB.skeleton); assert.equal(rigA.geometry, rigB.geometry);
  rigA.skeleton.computeBoneTexture(); rigB.skeleton.computeBoneTexture(); const siblingTexture = rigB.skeleton.boneTexture;
  let sharedGeometryDisposed = false; a.geometry.addEventListener('dispose', () => { sharedGeometryDisposed = true; });
  dispose(first);
  assert.equal(sharedGeometryDisposed, false); assert.equal(rigB.skeleton.boneTexture, siblingTexture);
  poseViewmodelArms(second, .5); assert.ok(sibling.position.distanceTo(neutral) > .1);
  dispose(second);
});
