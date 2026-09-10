import * as THREE from 'three';
import type { MapDefinition, MapId } from '../shared/map';

interface LightingProfile {
  sunDirection: readonly [number, number, number];
  sunColor: number;
  sunIntensity: number;
  zenith: number;
  horizon: number;
  ground: number;
  ambientColor: number;
  ambientIntensity: number;
  environmentIntensity: number;
  fogColor: number;
  fogDensity: number;
  cloudCoverage: number;
}

const PROFILES: Record<MapId, LightingProfile> = {
  yard: {
    sunDirection: [-.53, .72, .45], sunColor: 0xffe1b3, sunIntensity: 3.15,
    zenith: 0x547fa7, horizon: 0xd5c4a9, ground: 0x77664e,
    ambientColor: 0xb0c9e2, ambientIntensity: .9, environmentIntensity: .95,
    fogColor: 0xbdb6a8, fogDensity: .0046, cloudCoverage: .23,
  },
  foundry: {
    sunDirection: [-.72, .44, .53], sunColor: 0xffcf9a, sunIntensity: 3.25,
    zenith: 0x526e92, horizon: 0xd2b3a1, ground: 0x625c56,
    ambientColor: 0x9fb9d5, ambientIntensity: .96, environmentIntensity: .95,
    fogColor: 0xadb0b5, fogDensity: .005, cloudCoverage: .4,
  },
  relay: {
    sunDirection: [-.54, .77, -.34], sunColor: 0xe7f0ff, sunIntensity: 2.85,
    zenith: 0x527ba5, horizon: 0xc3cdd1, ground: 0x667568,
    ambientColor: 0xb9d0e2, ambientIntensity: 1, environmentIntensity: 1,
    fogColor: 0xa8b8be, fogDensity: .0044, cloudCoverage: .52,
  },
};

const smooth = (a: number, b: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Bilinear value noise on a cloud plane produces irregular wisps without
// visible latitude bands or a seam at the back of the panoramic sky.
function cloudNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(0, 1, x - ix), fy = smooth(0, 1, y - iy);
  const hash = (a: number, b: number) => {
    let value = Math.imul(a, 374761393) + Math.imul(b, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  };
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), fx),
    THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy,
  );
}

/** One small HDR panorama supplies the visible sky and its matching reflections.
 * The horizon is desaturated by haze while the zenith retains blue sky light.
 * Directional sun scatter and spherical cloud variation also stay coherent
 * across the panorama seam; this costs no animated sky or postprocessing pass. */
function skyPanorama(profile: LightingProfile, sun: THREE.Vector3): THREE.DataTexture {
  const width = 1024, height = 512;
  const data = new Uint16Array(width * height * 4);
  const zenith = new THREE.Color(profile.zenith), horizon = new THREE.Color(profile.horizon);
  const ground = new THREE.Color(profile.ground), sunColor = new THREE.Color(profile.sunColor);
  const zenithChannels = zenith.toArray(), horizonChannels = horizon.toArray();
  const groundChannels = ground.toArray(), sunChannels = sunColor.toArray();
  for (let y = 0; y < height; y++) {
    // DataTexture row zero corresponds to v=0, the southern hemisphere.
    const elevation = ((y + .5) / height - .5) * Math.PI;
    const dy = Math.sin(elevation), horizontal = Math.cos(elevation);
    const skyBlend = Math.pow(Math.max(0, dy), .43);
    const below = smooth(-.09, .025, dy);
    for (let x = 0; x < width; x++) {
      const azimuth = ((x + .5) / width - .5) * Math.PI * 2;
      const dx = Math.cos(azimuth) * horizontal, dz = Math.sin(azimuth) * horizontal;
      const sunDot = Math.max(0, dx * sun.x + dy * sun.y + dz * sun.z);
      const scatter = Math.pow(sunDot, 8) * .095 + Math.pow(sunDot, 96) * .28;
      // The source disk has a sub-degree soft edge so it filters without sparkles.
      const disk = smooth(Math.cos(.008), Math.cos(.0028), sunDot) * 24;
      const cloudHeight = Math.max(.12, dy);
      const cx = dx / cloudHeight * 3.7 + 11, cz = dz / cloudHeight * 3.7 + 23;
      const noise = dy > .035 ? cloudNoise(cx, cz) * .56
        + cloudNoise(cx * 2.1, cz * 2.1) * .27
        + cloudNoise(cx * 4.3, cz * 4.3) * .12
        + cloudNoise(cx * 8.7, cz * 8.7) * .05 : 0;
      const cloud = smooth(.4, .69, noise) * profile.cloudCoverage
        * smooth(.035, .2, dy) * (1 - smooth(.78, .98, dy));
      const groundShade = .58 + .24 * (1 + dy);
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        let sky = THREE.MathUtils.lerp(horizonChannels[channel], zenithChannels[channel], skyBlend);
        sky = THREE.MathUtils.lerp(sky, .76 + sunChannels[channel] * .12, cloud * .58);
        sky += sunChannels[channel] * (scatter + disk);
        const value = THREE.MathUtils.lerp(groundChannels[channel] * groundShade, sky, below);
        data[index + channel] = THREE.DataUtils.toHalfFloat(value);
      }
      data[index + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = 'Map sky radiance';
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export interface WorldLighting {
  environment: THREE.Texture;
  environmentIntensity: number;
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  sunDirection: THREE.Vector3;
  sunVisibility(position: THREE.Vector3): number;
  dispose(): void;
}

export function createWorldLighting(scene: THREE.Scene, map: MapDefinition): WorldLighting {
  const profile = PROFILES[map.id];
  const sunDirection = new THREE.Vector3(...profile.sunDirection).normalize();
  const environment = skyPanorama(profile, sunDirection);
  scene.background = environment;
  scene.backgroundIntensity = .87;
  scene.environment = environment;
  scene.environmentIntensity = profile.environmentIntensity;
  scene.fog = new THREE.FogExp2(profile.fogColor, profile.fogDensity);
  const ambient = new THREE.HemisphereLight(profile.ambientColor, profile.ground, profile.ambientIntensity);
  const sun = new THREE.DirectionalLight(profile.sunColor, profile.sunIntensity);
  sun.position.copy(sunDirection).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = map.size * .64;
  Object.assign(sun.shadow.camera, {left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 150});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.00035;
  sun.shadow.normalBias = .04;
  scene.add(ambient, sun, sun.target);

  // Coarse map solids suffice to keep first-person lighting grounded in shade.
  // The test is independent of render meshes and uses reusable scratch objects.
  const blockers = map.boxes.filter(box => box.h > .12 && box.w > .12 && box.d > .12)
    .map(box => new THREE.Box3(
      new THREE.Vector3(box.x - box.w / 2, box.y - box.h / 2, box.z - box.d / 2),
      new THREE.Vector3(box.x + box.w / 2, box.y + box.h / 2, box.z + box.d / 2),
    ));
  const ray = new THREE.Ray(new THREE.Vector3(), sunDirection), hit = new THREE.Vector3();
  return {
    environment, environmentIntensity: profile.environmentIntensity, sun, ambient, sunDirection,
    sunVisibility(position) {
      ray.origin.copy(position).addScaledVector(sunDirection, .08);
      return blockers.some(box => ray.intersectBox(box, hit) !== null) ? .06 : 1;
    },
    dispose() {
      scene.remove(ambient, sun, sun.target);
      if (scene.background === environment) scene.background = null;
      if (scene.environment === environment) scene.environment = null;
      sun.shadow.map?.dispose();
      environment.dispose();
    },
  };
}

/** Rotate world lighting into the fixed first-person camera's coordinate frame.
 * There are no studio lights: turning toward the map sun turns the highlight,
 * and walking under cover smoothly attenuates the direct light. */
export function createViewLighting(scene: THREE.Scene): {
  update(world: WorldLighting, worldCamera: THREE.Camera, dt: number): void;
  dispose(): void;
} {
  const sun = new THREE.DirectionalLight(), ambient = new THREE.HemisphereLight();
  sun.castShadow = true;
  sun.target.position.set(.05, -.3, -.75);
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: 7, far: 13});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.00018;
  sun.shadow.normalBias = .003;
  const inverseCamera = new THREE.Quaternion(), cameraRotation = new THREE.Quaternion();
  const direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), cameraPosition = new THREE.Vector3();
  let directVisibility = 1;
  scene.add(sun, sun.target, ambient);
  return {
    update(world, worldCamera, dt) {
      worldCamera.getWorldQuaternion(cameraRotation);
      inverseCamera.copy(cameraRotation).invert();
      worldCamera.getWorldPosition(cameraPosition);
      const visibility = world.sunVisibility(cameraPosition);
      directVisibility = THREE.MathUtils.damp(directVisibility, visibility, 12, Math.max(0, dt));
      sun.color.copy(world.sun.color);
      sun.intensity = world.sun.intensity * directVisibility;
      direction.copy(world.sunDirection).applyQuaternion(inverseCamera);
      sun.position.copy(direction).multiplyScalar(10).add(sun.target.position);
      ambient.color.copy(world.ambient.color);
      ambient.groundColor.copy(world.ambient.groundColor);
      ambient.intensity = world.ambient.intensity;
      ambient.position.copy(up).applyQuaternion(inverseCamera);
      scene.environment = world.environment;
      scene.environmentIntensity = world.environmentIntensity;
      // Three negates these Euler angles when creating the environment sample
      // matrix. Negating the camera angles here makes that matrix camera-to-world.
      scene.environmentRotation.setFromQuaternion(cameraRotation, 'YXZ');
      scene.environmentRotation.x *= -1;
      scene.environmentRotation.y *= -1;
      scene.environmentRotation.z *= -1;
    },
    dispose() { scene.remove(sun, sun.target, ambient); sun.shadow.map?.dispose(); },
  };
}
