import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { getCornerOcclusionState } from './HallCornerShadows.jsx'
import {
  WALL_MATERIAL_NAMES as TECH_HALL_WALL_MATERIALS,
  measureTechHallJunctions,
} from './TechHallCornerShadows.jsx'
import {
  WALL_MATERIAL_NAMES as CARE_HALL_WALL_MATERIALS,
  CARE_HALL_MEASURE_JUNCTIONS,
} from './CareHallCornerShadows.jsx'
import {
  RECT_HALLS,
  RECT_HALL_MEASURE_JUNCTIONS,
  makeBoundaryWallFilter,
} from './RectHallsCornerShadows.jsx'

const MAX_CEILING_LINES = 48
const MAX_CEILING_LIGHT_ZONES = 64
const CEILING_EDGE_RADIUS = 0.55
const CEILING_EDGE_STRENGTH = 0.18
const CEILING_LAYER_TOLERANCE = 0.18
const CEILING_LIGHT_CLEARANCE = 0.22
const CEILING_LIGHT_FEATHER = 0.1
const LIGHT_COMPONENT_GAP = 0.04
const LIGHT_MATERIAL_PATTERN = /白灯|灯|顶部蓝/
const CEILING_MIN_Y = 4.35
const CEILING_MAX_Y = 6.5

const HALL_DEFINITIONS = [
  {
    id: 'tech',
    wallMaterialNames: TECH_HALL_WALL_MATERIALS,
    measureJunctions: measureTechHallJunctions,
  },
  {
    id: 'care',
    wallMaterialNames: CARE_HALL_WALL_MATERIALS,
    measureJunctions: CARE_HALL_MEASURE_JUNCTIONS,
  },
  ...RECT_HALLS.map((hall) => ({
    ...hall,
    measureJunctions: RECT_HALL_MEASURE_JUNCTIONS,
    useBoundaryFallback: true,
  })),
]

function materialAtHit(hit) {
  const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material]
  const materialIndex = Array.isArray(hit.object.material) ? (hit.face?.materialIndex ?? 0) : 0
  return { material: materials[materialIndex], materialIndex }
}

function isLightMaterial(material) {
  return LIGHT_MATERIAL_PATTERN.test(material?.name ?? '')
}

function buildHallCornerStates(scene, worldLayout) {
  if (!scene || !worldLayout?.halls) return []

  return HALL_DEFINITIONS.map((definition) => {
    const hallEntry = worldLayout.halls.find((hall) => hall.id === definition.id)
    if (!hallEntry) return null
    const fallbackMeshFilter = definition.useBoundaryFallback
      ? makeBoundaryWallFilter(hallEntry)
      : null
    const state = getCornerOcclusionState(
      scene,
      hallEntry,
      definition.wallMaterialNames,
      definition.measureJunctions,
      null,
      fallbackMeshFilter,
    )
    if (!state?.junctions?.length) return null

    const xs = state.junctions.map((junction) => junction.x)
    const zs = state.junctions.map((junction) => junction.y)
    return {
      id: definition.id,
      state,
      bounds: {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
      },
    }
  }).filter(Boolean)
}

function boxIntersectsHall(box, bounds, padding = 0) {
  return !(
    box.max.x < bounds.minX - padding ||
    box.min.x > bounds.maxX + padding ||
    box.max.z < bounds.minZ - padding ||
    box.min.z > bounds.maxZ + padding
  )
}

function collectCeilingCandidates(scene, hallStates) {
  const candidates = []
  scene.traverse((object) => {
    if (!object.isMesh) return
    object.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty() || box.max.y < CEILING_MIN_Y || box.min.y > CEILING_MAX_Y) return
    const size = box.getSize(new THREE.Vector3())
    if (Math.max(size.x, size.z) < 0.45) return
    if (!hallStates.some((hall) => boxIntersectsHall(box, hall.bounds, 0.4))) return
    candidates.push(object)
  })
  return candidates
}

function sampleAxis(min, max) {
  const inset = Math.min(0.62, Math.max(0.28, (max - min) * 0.12))
  return [min + inset, (min + max) / 2, max - inset]
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function makeEdgeRecord(hallId, axis, coord, spanA, spanB, sign, ceilingY) {
  return {
    hallId,
    axis,
    coord,
    spanMin: Math.min(spanA, spanB),
    spanMax: Math.max(spanA, spanB),
    sign,
    ceilingY,
  }
}

function buildRectangularCeilingEdges(hall, ceilingY) {
  const { minX, maxX, minZ, maxZ } = hall.bounds
  return [
    makeEdgeRecord(hall.id, 'x', minX, minZ, maxZ, 1, ceilingY),
    makeEdgeRecord(hall.id, 'x', maxX, minZ, maxZ, -1, ceilingY),
    makeEdgeRecord(hall.id, 'z', minZ, minX, maxX, 1, ceilingY),
    makeEdgeRecord(hall.id, 'z', maxZ, minX, maxX, -1, ceilingY),
  ]
}

// 技术设备厅东侧是“柱面 + 中段凹墙”，不能把 x=柱面 连成一条直线；否则
// 阴影会横跨凹墙前方。按已有 6 个实测转角拆成 8 段真实墙顶线。
function buildTechCeilingEdges(hall, ceilingY) {
  const junctions = hall.state.junctions
  if (junctions.length < 6) return buildRectangularCeilingEdges(hall, ceilingY)

  const [westSouth, westNorth, eastSouth, eastNorth, recessSouth, recessNorth] = junctions
  return [
    makeEdgeRecord(hall.id, 'x', westSouth.x, westSouth.y, westNorth.y, westSouth.z, ceilingY),
    makeEdgeRecord(hall.id, 'z', westSouth.y, westSouth.x, eastSouth.x, westSouth.w, ceilingY),
    makeEdgeRecord(hall.id, 'z', westNorth.y, westNorth.x, eastNorth.x, westNorth.w, ceilingY),
    makeEdgeRecord(hall.id, 'x', eastSouth.x, eastSouth.y, recessSouth.y, eastSouth.z, ceilingY),
    makeEdgeRecord(hall.id, 'z', recessSouth.y, eastSouth.x, recessSouth.x, recessSouth.w, ceilingY),
    makeEdgeRecord(hall.id, 'x', recessSouth.x, recessSouth.y, recessNorth.y, recessSouth.z, ceilingY),
    makeEdgeRecord(hall.id, 'z', recessNorth.y, eastNorth.x, recessNorth.x, recessNorth.w, ceilingY),
    makeEdgeRecord(hall.id, 'x', eastNorth.x, recessNorth.y, eastNorth.y, eastNorth.z, ceilingY),
  ].filter((edge) => edge.spanMax - edge.spanMin > 0.08)
}

function collectCeilingSlotsAndEdges(scene, hallStates) {
  const candidates = collectCeilingCandidates(scene, hallStates)
  const slotsByMesh = new Map()
  const edgeRecords = []
  const raycaster = new THREE.Raycaster()
  raycaster.far = CEILING_MAX_Y - 3.9

  for (const hall of hallStates) {
    const ceilingYs = []
    const xs = sampleAxis(hall.bounds.minX, hall.bounds.maxX)
    const zs = sampleAxis(hall.bounds.minZ, hall.bounds.maxZ)

    for (const x of xs) {
      for (const z of zs) {
        raycaster.set(new THREE.Vector3(x, 4.05, z), new THREE.Vector3(0, 1, 0))
        const hits = raycaster.intersectObjects(candidates, false)
        const ceilingHit = hits.find((hit) => {
          if (hit.point.y < CEILING_MIN_Y || hit.point.y > CEILING_MAX_Y) return false
          const { material } = materialAtHit(hit)
          if (!material || isLightMaterial(material)) return false
          const worldNormal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld)
          return worldNormal && Math.abs(worldNormal.y) >= 0.58
        })
        if (!ceilingHit) continue

        const { materialIndex } = materialAtHit(ceilingHit)
        if (!slotsByMesh.has(ceilingHit.object)) slotsByMesh.set(ceilingHit.object, new Set())
        slotsByMesh.get(ceilingHit.object).add(materialIndex)
        ceilingYs.push(ceilingHit.point.y)
      }
    }

    const ceilingY = median(ceilingYs)
    if (ceilingY == null) continue
    edgeRecords.push(...(
      hall.id === 'tech'
        ? buildTechCeilingEdges(hall, ceilingY)
        : buildRectangularCeilingEdges(hall, ceilingY)
    ))
  }

  return {
    slots: [...slotsByMesh].map(([mesh, materialIndices]) => ({ mesh, materialIndices })),
    edgeRecords: edgeRecords.slice(0, MAX_CEILING_LINES),
  }
}

function triangleMaterialIndex(geometry, triangle) {
  const offset = triangle * 3
  const group = geometry.groups?.find(
    (candidate) => offset >= candidate.start && offset < candidate.start + candidate.count,
  )
  return group?.materialIndex ?? 0
}

function mergeLightFootprints(footprints) {
  const merged = footprints.map((footprint) => ({ ...footprint }))
  let changed = true

  while (changed) {
    changed = false
    outer: for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        const a = merged[i]
        const b = merged[j]
        if (
          a.maxX < b.minX - LIGHT_COMPONENT_GAP ||
          b.maxX < a.minX - LIGHT_COMPONENT_GAP ||
          a.maxZ < b.minZ - LIGHT_COMPONENT_GAP ||
          b.maxZ < a.minZ - LIGHT_COMPONENT_GAP ||
          a.maxY < b.minY - 0.2 ||
          b.maxY < a.minY - 0.2
        ) continue

        a.minX = Math.min(a.minX, b.minX)
        a.maxX = Math.max(a.maxX, b.maxX)
        a.minY = Math.min(a.minY, b.minY)
        a.maxY = Math.max(a.maxY, b.maxY)
        a.minZ = Math.min(a.minZ, b.minZ)
        a.maxZ = Math.max(a.maxZ, b.maxZ)
        merged.splice(j, 1)
        changed = true
        break outer
      }
    }
  }

  return merged
}

function distanceToRange(value, min, max) {
  return Math.max(min - value, value - max, 0)
}

function rangesOverlap(aMin, aMax, bMin, bMax, padding = 0) {
  return aMax >= bMin - padding && aMin <= bMax + padding
}

function lightZoneTouchesEdge(zone, edge, reach) {
  if (Math.abs(zone.maxY - edge.ceilingY) > 0.6) return false
  if (edge.axis === 'x') {
    return (
      distanceToRange(edge.coord, zone.minX, zone.maxX) <= reach &&
      rangesOverlap(zone.minZ, zone.maxZ, edge.spanMin, edge.spanMax, reach)
    )
  }
  return (
    distanceToRange(edge.coord, zone.minZ, zone.maxZ) <= reach &&
    rangesOverlap(zone.minX, zone.maxX, edge.spanMin, edge.spanMax, reach)
  )
}

function collectCeilingLightZones(scene, edgeRecords) {
  const footprints = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some(isLightMaterial)) return
    const position = object.geometry?.attributes?.position
    if (!position) return

    object.updateWorldMatrix(true, false)
    const index = object.geometry.index
    const triangleCount = index ? index.count / 3 : position.count / 3
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      if (!isLightMaterial(materials[triangleMaterialIndex(object.geometry, triangle)])) continue
      const ia = index ? index.getX(triangle * 3) : triangle * 3
      const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
      const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2
      a.fromBufferAttribute(position, ia).applyMatrix4(object.matrixWorld)
      b.fromBufferAttribute(position, ib).applyMatrix4(object.matrixWorld)
      c.fromBufferAttribute(position, ic).applyMatrix4(object.matrixWorld)
      const maxY = Math.max(a.y, b.y, c.y)
      if (maxY < CEILING_MIN_Y) continue
      footprints.push({
        minX: Math.min(a.x, b.x, c.x),
        maxX: Math.max(a.x, b.x, c.x),
        minY: Math.min(a.y, b.y, c.y),
        maxY,
        minZ: Math.min(a.z, b.z, c.z),
        maxZ: Math.max(a.z, b.z, c.z),
      })
    }
  })

  const reach = CEILING_EDGE_RADIUS + CEILING_LIGHT_CLEARANCE + CEILING_LIGHT_FEATHER
  return mergeLightFootprints(footprints)
    .filter((zone) => edgeRecords.some((edge) => lightZoneTouchesEdge(zone, edge, reach)))
    .slice(0, MAX_CEILING_LIGHT_ZONES)
}

function applyCeilingEdgeOcclusion(material, state) {
  const shadowMaterial = material.clone()
  const previousOnBeforeCompile = material.onBeforeCompile?.bind(material)
  const previousCacheKey = material.customProgramCacheKey?.bind(material)

  shadowMaterial.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer)

    const xEdges = state.edgeRecords
      .filter((edge) => edge.axis === 'x')
      .map((edge) => new THREE.Vector4(edge.coord, edge.spanMin, edge.spanMax, edge.sign))
    const xHeights = state.edgeRecords
      .filter((edge) => edge.axis === 'x')
      .map((edge) => new THREE.Vector2(edge.ceilingY, 0))
    const zEdges = state.edgeRecords
      .filter((edge) => edge.axis === 'z')
      .map((edge) => new THREE.Vector4(edge.coord, edge.spanMin, edge.spanMax, edge.sign))
    const zHeights = state.edgeRecords
      .filter((edge) => edge.axis === 'z')
      .map((edge) => new THREE.Vector2(edge.ceilingY, 0))
    const lightZones = state.lightZones.map(
      (zone) => new THREE.Vector4(zone.minX, zone.maxX, zone.minZ, zone.maxZ),
    )
    while (xEdges.length < MAX_CEILING_LINES) xEdges.push(new THREE.Vector4())
    while (xHeights.length < MAX_CEILING_LINES) xHeights.push(new THREE.Vector2())
    while (zEdges.length < MAX_CEILING_LINES) zEdges.push(new THREE.Vector4())
    while (zHeights.length < MAX_CEILING_LINES) zHeights.push(new THREE.Vector2())
    while (lightZones.length < MAX_CEILING_LIGHT_ZONES) lightZones.push(new THREE.Vector4())

    shader.uniforms.sixHallCeilXEdges = { value: xEdges }
    shader.uniforms.sixHallCeilXHeights = { value: xHeights }
    shader.uniforms.sixHallCeilXCount = {
      value: state.edgeRecords.filter((edge) => edge.axis === 'x').length,
    }
    shader.uniforms.sixHallCeilZEdges = { value: zEdges }
    shader.uniforms.sixHallCeilZHeights = { value: zHeights }
    shader.uniforms.sixHallCeilZCount = {
      value: state.edgeRecords.filter((edge) => edge.axis === 'z').length,
    }
    shader.uniforms.sixHallCeilLightZones = { value: lightZones }
    shader.uniforms.sixHallCeilLightZoneCount = { value: state.lightZones.length }
    shader.uniforms.sixHallCeilRadius = { value: CEILING_EDGE_RADIUS }
    shader.uniforms.sixHallCeilStrength = { value: CEILING_EDGE_STRENGTH }
    shader.uniforms.sixHallCeilLightClearance = { value: CEILING_LIGHT_CLEARANCE }
    shader.uniforms.sixHallCeilLightFeather = { value: CEILING_LIGHT_FEATHER }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSixHallCeilWorldPosition;\nvarying vec3 vSixHallCeilWorldNormal;',
      )
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvSixHallCeilWorldNormal = normalize(mat3(modelMatrix) * objectNormal);',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvSixHallCeilWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSixHallCeilWorldPosition;
varying vec3 vSixHallCeilWorldNormal;
uniform vec4 sixHallCeilXEdges[${MAX_CEILING_LINES}];
uniform vec2 sixHallCeilXHeights[${MAX_CEILING_LINES}];
uniform int sixHallCeilXCount;
uniform vec4 sixHallCeilZEdges[${MAX_CEILING_LINES}];
uniform vec2 sixHallCeilZHeights[${MAX_CEILING_LINES}];
uniform int sixHallCeilZCount;
uniform vec4 sixHallCeilLightZones[${MAX_CEILING_LIGHT_ZONES}];
uniform int sixHallCeilLightZoneCount;
uniform float sixHallCeilRadius;
uniform float sixHallCeilStrength;
uniform float sixHallCeilLightClearance;
uniform float sixHallCeilLightFeather;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float sixHallCeilOcc = 0.0;
for (int i = 0; i < sixHallCeilXCount; i++) {
  vec4 sixHallEdge = sixHallCeilXEdges[i];
  float sixHallDistance = sixHallEdge.w * (vSixHallCeilWorldPosition.x - sixHallEdge.x);
  float sixHallAlong =
    step(sixHallEdge.y, vSixHallCeilWorldPosition.z) *
    step(vSixHallCeilWorldPosition.z, sixHallEdge.z);
  float sixHallHeight = 1.0 - smoothstep(
    0.12,
    0.34,
    abs(vSixHallCeilWorldPosition.y - sixHallCeilXHeights[i].x)
  );
  sixHallCeilOcc = max(
    sixHallCeilOcc,
    (1.0 - smoothstep(0.0, sixHallCeilRadius, sixHallDistance)) *
      step(-${CEILING_LAYER_TOLERANCE.toFixed(2)}, sixHallDistance) *
      sixHallAlong * sixHallHeight
  );
}
for (int i = 0; i < sixHallCeilZCount; i++) {
  vec4 sixHallEdge = sixHallCeilZEdges[i];
  float sixHallDistance = sixHallEdge.w * (vSixHallCeilWorldPosition.z - sixHallEdge.x);
  float sixHallAlong =
    step(sixHallEdge.y, vSixHallCeilWorldPosition.x) *
    step(vSixHallCeilWorldPosition.x, sixHallEdge.z);
  float sixHallHeight = 1.0 - smoothstep(
    0.12,
    0.34,
    abs(vSixHallCeilWorldPosition.y - sixHallCeilZHeights[i].x)
  );
  sixHallCeilOcc = max(
    sixHallCeilOcc,
    (1.0 - smoothstep(0.0, sixHallCeilRadius, sixHallDistance)) *
      step(-${CEILING_LAYER_TOLERANCE.toFixed(2)}, sixHallDistance) *
      sixHallAlong * sixHallHeight
  );
}
float sixHallLightKeep = 1.0;
for (int i = 0; i < sixHallCeilLightZoneCount; i++) {
  vec4 sixHallZone = sixHallCeilLightZones[i];
  float sixHallLightDx = max(
    sixHallZone.x - vSixHallCeilWorldPosition.x,
    vSixHallCeilWorldPosition.x - sixHallZone.y
  );
  float sixHallLightDz = max(
    sixHallZone.z - vSixHallCeilWorldPosition.z,
    vSixHallCeilWorldPosition.z - sixHallZone.w
  );
  sixHallLightKeep *= smoothstep(
    sixHallCeilLightClearance,
    sixHallCeilLightClearance + sixHallCeilLightFeather,
    max(sixHallLightDx, sixHallLightDz)
  );
}
float sixHallCeilFace = smoothstep(0.58, 0.88, abs(normalize(vSixHallCeilWorldNormal).y));
outgoingLight *= 1.0 - sixHallCeilOcc * sixHallLightKeep * sixHallCeilFace * sixHallCeilStrength;
#include <opaque_fragment>`,
      )
  }

  shadowMaterial.customProgramCacheKey = () =>
    `${previousCacheKey?.() ?? ''}|six-halls-ceiling-edges-v2`
  shadowMaterial.needsUpdate = true
  return shadowMaterial
}

function buildCeilingShadowState(scene, worldLayout) {
  const hallStates = buildHallCornerStates(scene, worldLayout)
  if (!hallStates.length) return null
  const horizontalState = collectCeilingSlotsAndEdges(scene, hallStates)
  if (!horizontalState.slots.length || !horizontalState.edgeRecords.length) return null
  return {
    ...horizontalState,
    hallStates,
    lightZones: collectCeilingLightZones(scene, horizontalState.edgeRecords),
  }
}

export function SixHallsCeilingEdgeShadows({ scene, worldLayout }) {
  const state = useMemo(
    () => (scene && worldLayout ? buildCeilingShadowState(scene, worldLayout) : null),
    [scene, worldLayout],
  )

  useEffect(() => {
    if (!state) return undefined

    const entries = state.slots.map(({ mesh, materialIndices }) => {
      const originalMaterial = mesh.material
      const originals = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]
      const disposables = []
      const patched = originals.map((material, index) => {
        if (!materialIndices.has(index) || !material?.clone) return material
        const shadowMaterial = applyCeilingEdgeOcclusion(material, state)
        disposables.push(shadowMaterial)
        return shadowMaterial
      })
      mesh.material = Array.isArray(originalMaterial) ? patched : patched[0]
      return { mesh, originalMaterial, patched, disposables }
    })

    let enabled = true
    const apply = (on) => {
      entries.forEach(({ mesh, originalMaterial, patched }) => {
        mesh.material = on
          ? Array.isArray(originalMaterial) ? patched : patched[0]
          : originalMaterial
      })
    }
    const toggle = () => {
      enabled = !enabled
      apply(enabled)
      return enabled ? 'on' : 'off'
    }

    if (typeof window !== 'undefined') {
      const debugState = {
        toggle,
        meshCount: entries.length,
        edgeCount: state.edgeRecords.length,
        lightZoneCount: state.lightZones.length,
        radius: CEILING_EDGE_RADIUS,
        strength: CEILING_EDGE_STRENGTH,
        edges: state.edgeRecords.map((edge) => ({ ...edge })),
        halls: Object.fromEntries(
          state.hallStates.map((hall) => [
            hall.id,
            state.edgeRecords.filter((record) => record.hallId === hall.id).length,
          ]),
        ),
      }
      window.__sixHallsCeilingEdgeShadows = debugState
      // 兼容之前的调试入口，避免已经打开的检查页因 HMR 暂时报错。
      window.__sixHallsCeilingCornerShadows = debugState
    }

    return () => {
      if (typeof window !== 'undefined' && window.__sixHallsCeilingCornerShadows?.toggle === toggle) {
        delete window.__sixHallsCeilingCornerShadows
      }
      if (typeof window !== 'undefined' && window.__sixHallsCeilingEdgeShadows?.toggle === toggle) {
        delete window.__sixHallsCeilingEdgeShadows
      }
      entries.forEach(({ mesh, originalMaterial, disposables }) => {
        mesh.material = originalMaterial
        disposables.forEach((material) => material.dispose())
      })
    }
  }, [state])

  return null
}
