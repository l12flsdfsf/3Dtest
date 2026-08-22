import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

// 厅内墙角暗角的通用实现:按材质名找到墙面网格,量出墙角缝(世界坐标),
// 用 onBeforeCompile 在墙材质上叠加「贴缝乘性压暗」。各厅的差异只有两处:
// - 哪些材质构成可见内墙面(wallMaterialNames);
// - 怎么量缝(measureJunctions,技术设备厅有柱子/凹墙,关怀厅是简单矩形角)。
const SHADER_CACHE_KEY = 'hall-corner-occlusion-v4'
export const MAX_JUNCTIONS = 64
export const BOTTOM_SHADOW_EXTENSION = 0.30

// 角落暗角参数(世界米制,两厅共用)
export const CORNER_RADIUS = 0.3 // 离墙角缝多远内淡出
export const CORNER_STRENGTH = 0.34 // 墙角处最大压暗比例
export const VERTICAL_FADE_IN = 0.2 // 贴地淡入(墙根有踢脚/展台遮挡)
export const VERTICAL_FADE_OUT = 0.35 // 近顶淡出(天花不压暗)

export function findWallMeshes(scene, materialNames, meshFilter = null) {
  const meshes = []
  const names = materialNames ?? []

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some((material) => names.includes(material?.name))) return
    if (meshFilter && !meshFilter(object)) return
    meshes.push(object)
  })

  return meshes
}

// 材质名匹配不上时的几何 fallback：按调用方给的 meshFilter 直接收网格
function findMeshesByFilter(scene, meshFilter) {
  const meshes = []

  if (!meshFilter) return meshes

  scene.traverse((object) => {
    if (!object.isMesh) return
    if (!meshFilter(object)) return
    meshes.push(object)
  })

  return meshes
}

// 无柱矩形厅的通用量缝(关怀/广播/电视/电影/展望实测都是这种角):
// 1) 南/北墙平面:厅内中线附近垂直打,深打(前 3 命中、层间容差 0.3m)收进
//    前后两层墙(展板带/照片在前、结构墙在后 ~3-17cm),南墙取最小 z、北墙
//    取最大 z(最外层),让两层都落在缝内侧——缝若取前层面,后段墙基会落在
//    缝外被门控成零,暗带就只有前层那半段高;
// 2) 东/西:中段偏移 + 贴角(z0/z1 各内收 0.5m,贴角段总有墙),同样取最外层;
// 3) 超距过滤:穿门洞的射线对厅名材质网格多直接落空,偶有命中走廊对面的
//    (共享材质时)以 maxWallDistance 分界丢弃——不能靠 min/max 兜底,厅内
//    高家具会误取;
// 4) 四条缝记为 (缝x, 缝z, x朝向, z朝向),朝向=房间在缝的哪一侧(±1)。
// probeHeight 按厅内家具定:墙前有到顶展柜的厅(关怀)打 2.6,其余 1.6 够用。
// 顶部处理:topGap(墙顶内收)+verticalFadeOut(淡出长度)。关怀厅顶上有灯
// (y4.82+),留 0.14+0.35 的空档正好被灯盖住;其余厅墙角直通天花且角部无灯,
// 空档会露出一条未压暗的墙——用 topGap=0 + 收窄淡出让暗带贴到天花。
export function makeRectangularMeasureJunctions({
  probeHeight = 1.6,
  maxWallDistance = 15,
  topGap = 0.14,
  verticalFadeOut = 0.35,
} = {}) {
  return function measureRectJunctions(meshes, fallbackBox, hallEntry) {
    const raycaster = new THREE.Raycaster()
    raycaster.far = 40
    const cx = (hallEntry.worldMinX + hallEntry.worldMaxX) / 2
    const cz = (hallEntry.worldMinZ + hallEntry.worldMaxZ) / 2
    const halfX = (hallEntry.worldMaxX - hallEntry.worldMinX) / 2
    const halfZ = (hallEntry.worldMaxZ - hallEntry.worldMinZ) / 2
    const midOffsets = [-0.42, -0.21, 0, 0.21, 0.42]

    // 每条射线取前 depth 个命中里贴近首命中的层(容差 0.3m),再丢弃超距命中
    const castAxisDeep = (dirX, dirZ, origins, depth) => {
      const values = []
      for (const origin of origins) {
        raycaster.set(origin, new THREE.Vector3(dirX, 0, dirZ))
        const hits = raycaster.intersectObjects(meshes, false).slice(0, depth)
        if (!hits.length) continue
        const primary = dirX !== 0 ? hits[0].point.x : hits[0].point.z
        const center = dirX !== 0 ? cx : cz
        for (const hit of hits) {
          const value = dirX !== 0 ? hit.point.x : hit.point.z
          if (Math.abs(value - primary) <= 0.3 && Math.abs(value - center) <= maxWallDistance) {
            values.push(value)
          }
        }
      }
      return values
    }

    const southHits = castAxisDeep(
      0,
      -1,
      midOffsets.map((t) => new THREE.Vector3(cx + t * halfX, probeHeight, cz)),
      3,
    )
    const northHits = castAxisDeep(
      0,
      1,
      midOffsets.map((t) => new THREE.Vector3(cx + t * halfX, probeHeight, cz)),
      3,
    )
    const z0 = southHits.length ? Math.min(...southHits) : fallbackBox.min.z + 0.12
    const z1 = northHits.length ? Math.max(...northHits) : fallbackBox.max.z - 0.12

    const zForX = [...midOffsets.map((t) => cz + t * halfZ), z0 + 0.5, z1 - 0.5]
    const westHits = castAxisDeep(
      -1,
      0,
      zForX.map((z) => new THREE.Vector3(cx, probeHeight, z)),
      3,
    )
    const eastHits = castAxisDeep(
      1,
      0,
      zForX.map((z) => new THREE.Vector3(cx, probeHeight, z)),
      3,
    )
    const x0 = westHits.length ? Math.min(...westHits) : fallbackBox.min.x + 0.12
    const x1 = eastHits.length ? Math.max(...eastHits) : fallbackBox.max.x - 0.12

    const junctions = [
      [x0, z0, 1, 1],
      [x0, z1, 1, -1],
      [x1, z0, -1, 1],
      [x1, z1, -1, -1],
    ]

    return {
      junctions: junctions.map(([x, z, fx, fz]) => new THREE.Vector4(x, z, fx, fz)),
      yBottom: fallbackBox.min.y,
      yTop: fallbackBox.max.y - topGap,
      verticalFadeOut,
    }
  }
}

// junctions: [(缝x, 缝z, x朝向, z朝向)] 世界坐标,朝向=房间在缝的哪一侧(±1);
// yBottom/yTop: 暗角的竖向范围。
// 墙面收集 = 材质名命中 ∪ fallbackMeshFilter 几何命中；fallback 命中的墙面
// 会在换装时对当前所有材质打 shader（不挑材质名），兼容后续 JSON 换材质名。
export function getCornerOcclusionState(
  scene,
  hallEntry,
  materialNames,
  measureJunctions,
  meshFilter,
  fallbackMeshFilter,
) {
  const materialMeshes = findWallMeshes(scene, materialNames, meshFilter)
  const fallbackMeshes = findMeshesByFilter(scene, fallbackMeshFilter)
  const fallbackMeshSet = new Set(fallbackMeshes)
  const meshes = [...new Set([...materialMeshes, ...fallbackMeshes])]
  if (!meshes.length) return null

  const box = new THREE.Box3()
  meshes.forEach((mesh) => box.expandByObject(mesh))
  if (box.isEmpty()) return null

  return {
    meshes,
    fallbackMeshSet,
    materialMeshCount: materialMeshes.length,
    fallbackMeshCount: fallbackMeshes.length,
    ...measureJunctions(meshes, box, hallEntry),
  }
}

function applyCornerOcclusion(
  material,
  state,
  layerSeamTolerance,
  cornerRadius,
  cornerStrength,
) {
  const shadowMaterial = material.clone()
  shadowMaterial.onBeforeCompile = (shader) => {
    const junctions = [...state.junctions]
    while (junctions.length < MAX_JUNCTIONS) junctions.push(new THREE.Vector4())
    shader.uniforms.hallJunctions = { value: junctions }
    shader.uniforms.hallJunctionCount = { value: state.junctions.length }
    shader.uniforms.hallCornerVertical = {
      value: new THREE.Vector2(state.yBottom, state.yTop),
    }
    shader.uniforms.hallCornerRadius = { value: cornerRadius }
    shader.uniforms.hallCornerStrength = { value: cornerStrength }
    shader.uniforms.hallCornerLayerTolerance = { value: layerSeamTolerance }
    // 顶部淡出按厅可配:关怀厅顶上有灯,留出空档;其余厅墙直通天花,收窄淡出
    shader.uniforms.hallCornerFadeOut = { value: state.verticalFadeOut ?? VERTICAL_FADE_OUT }
    shader.uniforms.hallCornerBaseRadius = { value: state.baseRadius ?? CORNER_RADIUS }
    shader.uniforms.hallCornerBaseHeight = { value: state.baseHeight ?? 0.55 }
    shader.uniforms.hallCornerBaseStrength = { value: state.baseStrength ?? 0 }
    shader.uniforms.hallCornerFloorHeight = { value: state.floorHeight ?? 0.18 }
    shader.uniforms.hallCornerFloorStrength = { value: state.floorStrength ?? 0 }
    shader.uniforms.hallCornerBottomEdgeHeight = { value: state.bottomEdgeHeight ?? 0.28 }
    shader.uniforms.hallCornerBottomEdgeStrength = { value: state.bottomEdgeStrength ?? 0 }
    shader.uniforms.hallCornerTopEdgeHeight = { value: state.topEdgeHeight ?? 0.28 }
    shader.uniforms.hallCornerTopEdgeStrength = { value: state.topEdgeStrength ?? 0 }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vHallCornerWorldPosition;\nvarying vec3 vHallCornerWorldNormal;',
      )
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvHallCornerWorldNormal = normalize(mat3(modelMatrix) * objectNormal);',
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
varying vec3 vHallCornerWorldNormal;
uniform vec4 hallJunctions[${MAX_JUNCTIONS}];
uniform int hallJunctionCount;
uniform vec2 hallCornerVertical;
uniform float hallCornerRadius;
uniform float hallCornerStrength;
uniform float hallCornerLayerTolerance;
uniform float hallCornerFadeOut;
uniform float hallCornerBaseRadius;
uniform float hallCornerBaseHeight;
uniform float hallCornerBaseStrength;
uniform float hallCornerFloorHeight;
uniform float hallCornerFloorStrength;
uniform float hallCornerBottomEdgeHeight;
uniform float hallCornerBottomEdgeStrength;
uniform float hallCornerTopEdgeHeight;
uniform float hallCornerTopEdgeStrength;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `// 每条墙角缝一个 (缝x, 缝z, x朝向, z朝向)：dx/dz 是到该缝两面的距离，
// 乘积让暗角贴缝分布，墙面中段不受影响；inside 把缝外侧的面排除。
// 多条缝(柱子两侧各成一条)取各缝结果的最大值。
float hallOcc = 0.0;
float hallBaseOcc = 0.0;
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
  hallBaseOcc = max(
    hallBaseOcc,
    (1.0 - smoothstep(0.0, hallCornerBaseRadius, hallDx)) *
      (1.0 - smoothstep(0.0, hallCornerBaseRadius, hallDz)) * hallInside
  );
}
float hallVerticalFade =
  smoothstep(hallCornerVertical.x - ${BOTTOM_SHADOW_EXTENSION.toFixed(2)}, hallCornerVertical.x + ${VERTICAL_FADE_IN.toFixed(2)}, vHallCornerWorldPosition.y) *
  (1.0 - smoothstep(hallCornerVertical.y - hallCornerFadeOut, hallCornerVertical.y, vHallCornerWorldPosition.y));
vec3 hallNormal = normalize(vHallCornerWorldNormal);
float hallVerticalWall = 1.0 - smoothstep(0.18, 0.34, abs(hallNormal.y));
float hallFloorSurface = smoothstep(0.65, 0.9, hallNormal.y);
float hallBaseFade = 1.0 - smoothstep(hallCornerVertical.x, hallCornerVertical.x + hallCornerBaseHeight, vHallCornerWorldPosition.y);
float hallFloorFade = 1.0 - smoothstep(hallCornerVertical.x + 0.02, hallCornerVertical.x + hallCornerFloorHeight, vHallCornerWorldPosition.y);
float hallBottomEdgeFade = 1.0 - smoothstep(hallCornerVertical.x, hallCornerVertical.x + hallCornerBottomEdgeHeight, vHallCornerWorldPosition.y);
float hallTopEdgeFade = smoothstep(hallCornerVertical.y - hallCornerTopEdgeHeight, hallCornerVertical.y, vHallCornerWorldPosition.y);
float hallWallShadow = hallOcc * hallVerticalFade * hallVerticalWall * hallCornerStrength;
float hallBaseShadow = hallBaseOcc * hallBaseFade * hallVerticalWall * hallCornerBaseStrength;
float hallFloorShadow = hallBaseOcc * hallFloorFade * hallFloorSurface * hallCornerFloorStrength;
float hallBottomEdgeShadow = hallBottomEdgeFade * hallVerticalWall * hallCornerBottomEdgeStrength;
float hallTopEdgeShadow = hallTopEdgeFade * hallVerticalWall * hallCornerTopEdgeStrength;
float hallHorizontalEdgeShadow = max(hallBottomEdgeShadow, hallTopEdgeShadow);
outgoingLight *= 1.0 - max(max(hallWallShadow, hallHorizontalEdgeShadow), max(hallBaseShadow, hallFloorShadow));
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
  meshFilter = null,
  fallbackMeshFilter = null,
  layerSeamTolerance = 0,
  cornerRadius = CORNER_RADIUS,
  cornerStrength = CORNER_STRENGTH,
}) {
  const state = useMemo(
    () =>
      scene && hallEntry
        ? getCornerOcclusionState(
            scene,
            hallEntry,
            wallMaterialNames,
            measureJunctions,
            meshFilter,
            fallbackMeshFilter,
          )
        : null,
    [scene, hallEntry, wallMaterialNames, measureJunctions, meshFilter, fallbackMeshFilter],
  )

  useEffect(() => {
    if (!state) return undefined

    const materialStates = state.meshes
      .map((mesh) => {
        const originalMaterial = mesh.material
        const originalMaterials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]
        const disposableMaterials = []
        // fallback 命中的墙面不挑材质名，当前材质全部换装
        const patchAllMaterials = state.fallbackMeshSet?.has(mesh)
        const shadowMaterials = originalMaterials.map((material) => {
          if (!patchAllMaterials && !wallMaterialNames.includes(material?.name)) return material
          if (!material?.clone) return material
          const shadowMaterial = applyCornerOcclusion(
            material,
            state,
            layerSeamTolerance,
            cornerRadius,
            cornerStrength,
          )
          disposableMaterials.push(shadowMaterial)
          return shadowMaterial
        })
        if (!disposableMaterials.length) return null
        mesh.material = Array.isArray(originalMaterial) ? shadowMaterials : shadowMaterials[0]
        return { mesh, originalMaterial, shadowMaterials, disposableMaterials }
      })
      .filter(Boolean)

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
      window[debugKey] = {
        toggle,
        junctions: state.junctions,
        meshCount: state.meshes.length,
        materialMeshCount: state.materialMeshCount,
        fallbackMeshCount: state.fallbackMeshCount,
        mode: state.fallbackMeshCount > 0 ? 'material+geometry' : 'material-name',
      }
    }

    return () => {
      if (typeof window !== 'undefined' && window[debugKey]?.toggle === toggle) {
        delete window[debugKey]
      }
      materialStates.forEach(({ mesh, originalMaterial, disposableMaterials }) => {
        mesh.material = originalMaterial
        disposableMaterials.forEach((material) => material.dispose())
      })
    }
  }, [state, debugKey, layerSeamTolerance, cornerRadius, cornerStrength, wallMaterialNames])

  return null
}
