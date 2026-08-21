import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

// 厅内墙角暗角的通用实现:按材质名找到墙面网格,量出墙角缝(世界坐标),
// 用 onBeforeCompile 在墙材质上叠加「贴缝乘性压暗」。各厅的差异只有两处:
// - 哪些材质构成可见内墙面(wallMaterialNames);
// - 怎么量缝(measureJunctions,技术设备厅有柱子/凹墙,关怀厅是简单矩形角)。
const SHADER_CACHE_KEY = 'hall-corner-occlusion-v1'
export const MAX_JUNCTIONS = 8
export const BOTTOM_SHADOW_EXTENSION = 0.30

// 角落暗角参数(世界米制,两厅共用)
export const CORNER_RADIUS = 1.0 // 离墙角缝多远内淡出
export const CORNER_STRENGTH = 0.34 // 墙角处最大压暗比例
export const VERTICAL_FADE_IN = 0.2 // 贴地淡入(墙根有踢脚/展台遮挡)
export const VERTICAL_FADE_OUT = 0.35 // 近顶淡出(天花不压暗)

export function findWallMeshes(scene, materialNames) {
  const meshes = []

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some((material) => materialNames.includes(material?.name))) return
    meshes.push(object)
  })

  return meshes
}

// junctions: [(缝x, 缝z, x朝向, z朝向)] 世界坐标,朝向=房间在缝的哪一侧(±1);
// yBottom/yTop: 暗角的竖向范围。
function getCornerOcclusionState(scene, hallEntry, materialNames, measureJunctions) {
  const meshes = findWallMeshes(scene, materialNames)
  if (!meshes.length) return null

  const box = new THREE.Box3()
  meshes.forEach((mesh) => box.expandByObject(mesh))
  if (box.isEmpty()) return null

  return { meshes, ...measureJunctions(meshes, box, hallEntry) }
}

function applyCornerOcclusion(material, state, layerSeamTolerance) {
  const shadowMaterial = material.clone()
  shadowMaterial.onBeforeCompile = (shader) => {
    const junctions = [...state.junctions]
    while (junctions.length < MAX_JUNCTIONS) junctions.push(new THREE.Vector4())
    shader.uniforms.hallJunctions = { value: junctions }
    shader.uniforms.hallJunctionCount = { value: state.junctions.length }
    shader.uniforms.hallCornerVertical = {
      value: new THREE.Vector2(state.yBottom, state.yTop),
    }
    shader.uniforms.hallCornerRadius = { value: CORNER_RADIUS }
    shader.uniforms.hallCornerStrength = { value: CORNER_STRENGTH }
    shader.uniforms.hallCornerLayerTolerance = { value: layerSeamTolerance }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vHallCornerWorldPosition;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvHallCornerWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vHallCornerWorldPosition;
uniform vec4 hallJunctions[${MAX_JUNCTIONS}];
uniform int hallJunctionCount;
uniform vec2 hallCornerVertical;
uniform float hallCornerRadius;
uniform float hallCornerStrength;
uniform float hallCornerLayerTolerance;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `// 每条墙角缝一个 (缝x, 缝z, x朝向, z朝向)：dx/dz 是到该缝两面的距离，
// 乘积让暗角贴缝分布，墙面中段不受影响；inside 把缝外侧的面排除。
// 多条缝(柱子两侧各成一条)取各缝结果的最大值。
float hallOcc = 0.0;
for (int i = 0; i < hallJunctionCount; i++) {
  vec4 hallJ = hallJunctions[i];
  float hallDx = hallJ.z * (vHallCornerWorldPosition.x - hallJ.x);
  float hallDz = hallJ.w * (vHallCornerWorldPosition.z - hallJ.y);
  // Adjacent wall layers can be offset slightly. Only relax the inside gate,
  // keeping the dark-band radius and strength unchanged.
  float hallInside =
    step(-hallCornerLayerTolerance, hallDx) *
    step(-hallCornerLayerTolerance, hallDz);
  hallOcc = max(
    hallOcc,
    (1.0 - smoothstep(0.0, hallCornerRadius, hallDx)) *
      (1.0 - smoothstep(0.0, hallCornerRadius, hallDz)) * hallInside
  );
}
float hallVerticalFade =
  smoothstep(hallCornerVertical.x - ${BOTTOM_SHADOW_EXTENSION.toFixed(2)}, hallCornerVertical.x + ${VERTICAL_FADE_IN.toFixed(2)}, vHallCornerWorldPosition.y) *
  (1.0 - smoothstep(hallCornerVertical.y - ${VERTICAL_FADE_OUT.toFixed(2)}, hallCornerVertical.y, vHallCornerWorldPosition.y));
outgoingLight *= 1.0 - hallOcc * hallVerticalFade * hallCornerStrength;
#include <opaque_fragment>`,
      )
  }
  shadowMaterial.customProgramCacheKey = () => SHADER_CACHE_KEY
  shadowMaterial.needsUpdate = true
  return shadowMaterial
}

// scene/hallEntry/measureJunctions 就绪后换装墙材质;debugKey 暴露
// window[debugKey] = { toggle, junctions } 供自动化截图对比(生产无副作用)。
export function HallCornerShadows({
  scene,
  hallEntry,
  wallMaterialNames,
  measureJunctions,
  debugKey,
  layerSeamTolerance = 0,
}) {
  const state = useMemo(
    () =>
      scene && hallEntry
        ? getCornerOcclusionState(scene, hallEntry, wallMaterialNames, measureJunctions)
        : null,
    [scene, hallEntry, wallMaterialNames, measureJunctions],
  )

  useEffect(() => {
    if (!state) return undefined

    const materialStates = state.meshes.map((mesh) => {
      const originalMaterial = mesh.material
      const originalMaterials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]
      const shadowMaterials = originalMaterials.map((material) =>
        applyCornerOcclusion(material, state, layerSeamTolerance),
      )
      mesh.material = Array.isArray(originalMaterial) ? shadowMaterials : shadowMaterials[0]
      return { mesh, originalMaterial, shadowMaterials }
    })

    let enabled = true
    const apply = (on) => {
      materialStates.forEach(({ mesh, originalMaterial, shadowMaterials }) => {
        mesh.material = on
          ? Array.isArray(originalMaterial) ? shadowMaterials : shadowMaterials[0]
          : originalMaterial
      })
    }
    const toggle = () => {
      enabled = !enabled
      apply(enabled)
      return enabled ? 'on' : 'off'
    }
    if (typeof window !== 'undefined') {
      window[debugKey] = { toggle, junctions: state.junctions }
    }

    return () => {
      if (typeof window !== 'undefined' && window[debugKey]?.toggle === toggle) {
        delete window[debugKey]
      }
      materialStates.forEach(({ mesh, originalMaterial, shadowMaterials }) => {
        mesh.material = originalMaterial
        shadowMaterials.forEach((material) => material.dispose())
      })
    }
  }, [state, debugKey, layerSeamTolerance])

  return null
}
