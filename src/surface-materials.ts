import * as THREE from 'three';

export type Surface = 'sand' | 'concrete' | 'asphalt' | 'steel' | 'wood' | 'grass' | 'terrazzo' | 'fabric';
const metres: Record<Surface, number> = {sand: 3, concrete: 2, asphalt: 3, steel: 1, wood: 1, grass: 2, terrazzo: 2, fabric: .5};
// Eight shared, mipmapped 1K tiles survive map changes. No per-map canvas noise,
// duplicate GPU uploads, or texture disposal while another scene still uses one.
const textures = new Map<Surface, THREE.Texture>();
export function surfaceTexture(surface: Surface): THREE.Texture {
  let texture = textures.get(surface);
  if (!texture) {
    texture = new THREE.TextureLoader().load(`/textures/${surface}.webp`);
    texture.name = `Dustline / ${surface}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    texture.userData.metres = metres[surface];
    // Painted panels retain the map's authored paint color; only a restrained
    // amount of the neutral steel tile modulates it with wear and scratches.
    texture.userData.colorStrength = surface === 'steel' ? .35 : 1;
    textures.set(surface, texture);
  }
  return texture;
}

/** World-scale planar UVs keep aggregate/grain the same size on a small prop and
 * a long wall, including nonuniformly scaled instances. One texture sample per
 * channel, rather than three fragment samples for blended triplanar mapping.
 * Intended for static architecture; animated/skinned assets keep authored UVs. */
export function tileWorldMaterial(material: THREE.MeshStandardMaterial): void {
  if (!material.map?.userData.metres) return;
  const scale = 1 / material.map.userData.metres;
  const colorStrength = material.map.userData.colorStrength;
  material.onBeforeCompile = shader => {
    shader.uniforms.surfaceScale = {value: scale};
    shader.uniforms.surfaceColorStrength = {value: colorStrength};
    shader.fragmentShader = 'uniform float surfaceColorStrength;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;',
        'diffuseColor *= mix(vec4(1.0), sampledDiffuseColor, surfaceColorStrength);'));
    shader.vertexShader = 'uniform float surfaceScale;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
      #include <worldpos_vertex>
      vec4 surfacePosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        surfacePosition = instanceMatrix * surfacePosition;
      #endif
      surfacePosition = modelMatrix * surfacePosition;
      vec3 surfaceNormal = abs(inverseTransformDirection(transformedNormal, viewMatrix));
      vec2 surfaceUv = surfaceNormal.y >= max(surfaceNormal.x, surfaceNormal.z)
        ? surfacePosition.xz : surfaceNormal.x >= surfaceNormal.z ? surfacePosition.zy : surfacePosition.xy;
      surfaceUv *= surfaceScale;
      #ifdef USE_MAP
        vMapUv = surfaceUv;
      #endif
      #ifdef USE_BUMPMAP
        vBumpMapUv = surfaceUv;
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'world-surface-v1';
}
