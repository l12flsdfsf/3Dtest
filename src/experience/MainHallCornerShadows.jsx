import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { HallCornerShadows, MAX_JUNCTIONS, findWallMeshes } from './HallCornerShadows.jsx'

const MAIN_HALL_MATERIALS = ['\u5927\u5385']
const MAIN_HALL_BOUNDS_MATERIALS = MAIN_HALL_MATERIALS
const MAIN_HALL_EDGE_MATERIALS = [
  '\u5927\u5385',
  '\u91d1\u5c5e',
  '\u5927\u5385\u767d\u677f',
  '\u5927\u5385\u9876\u90e8\u84dd',
]

const PLANE_THICKNESS = 0.08
const PLANE_COORD_TOLERANCE = 0.16
const SPAN_TOLERANCE = 0.14
const MIN_VERTICAL_SPAN = 2.0
const MIN_HORIZONTAL_SPAN = 1.0
const MIN_WALL_MESH_HEIGHT = 2.2
const MIN_WALL_MESH_LENGTH = 2.5
const MAX_WALL_MESH_BOTTOM = 1.2
const MIN_WALL_MESH_TOP = 3.0
const BASE_SHADOW_RADIUS = 1.15
const BASE_SHADOW_HEIGHT = 0.68
const BASE_SHADOW_STRENGTH = 0.28
const FLOOR_SHADOW_HEIGHT = 0.28
const FLOOR_SHADOW_STRENGTH = 0.2
const BOTTOM_EDGE_HEIGHT = 0.34
const BOTTOM_EDGE_STRENGTH = 0.2
const TOP_EDGE_HEIGHT = 0.32
// Top wall-edge shading is handled by split overlays so lit ceiling zones stay clean.
const TOP_EDGE_STRENGTH = 0
const EDGE_OVERLAY_OFFSET = 0.012
const EDGE_OVERLAY_MIN_LENGTH = 0.8
const FLOOR_STRIP_WIDTH = 0.42
const CEILING_STRIP_WIDTH = 0.38
const CEILING_EDGE_INSET = 0.045
const CEILING_LIGHT_CLEARANCE = 0.22
const EDGE_PLANE_TOLERANCE = 0.18
const CEILING_LIGHT_MATERIAL_PATTERN = /\u767d\u706f|\u706f|\u5927\u5385\u9876\u90e8\u84dd/

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _ab = new THREE.Vector3()
const _ac = new THREE.Vector3()
const _normal = new THREE.Vector3()

function makeShadowMaterial(alphaExpression, opacity) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      opacity: { value: opacity },
    },
    vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform float opacity;
varying vec2 vUv;
void main() {
  float alpha = opacity * (${alphaExpression});
  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
}`,
  })
}

function isMainHallWallMesh(object) {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return false

  const size = box.getSize(new THREE.Vector3())
  return (
    size.y >= MIN_WALL_MESH_HEIGHT &&
    box.min.y < MAX_WALL_MESH_BOTTOM &&
    box.max.y > MIN_WALL_MESH_TOP &&
    Math.max(size.x, size.z) >= MIN_WALL_MESH_LENGTH
  )
}

function getMainHallEntry(scene) {
  const meshes = findWallMeshes(scene, MAIN_HALL_BOUNDS_MATERIALS, isMainHallWallMesh)
  if (!meshes.length) return null

  const box = new THREE.Box3()
  meshes.forEach((mesh) => box.expandByObject(mesh))
  if (box.isEmpty()) return null

  return {
    id: 'main-hall',
    worldMinX: box.min.x,
    worldMaxX: box.max.x,
    worldMinZ: box.min.z,
    worldMaxZ: box.max.z,
  }
}

function readWorldVertex(position, index, object, target) {
  target.fromBufferAttribute(position, index)
  return target.applyMatrix4(object.matrixWorld)
}

function addPlane(clusters, plane) {
  const existing = clusters.find(
    (cluster) =>
      cluster.sign === plane.sign &&
      Math.abs(cluster.coord - plane.coord) <= PLANE_COORD_TOLERANCE,
  )

  if (!existing) {
    clusters.push({ ...plane, count: 1 })
    return
  }

  existing.coord = (existing.coord * existing.count + plane.coord) / (existing.count + 1)
  existing.spanMin = Math.min(existing.spanMin, plane.spanMin)
  existing.spanMax = Math.max(existing.spanMax, plane.spanMax)
  existing.yMin = Math.min(existing.yMin, plane.yMin)
  existing.yMax = Math.max(existing.yMax, plane.yMax)
  existing.count += 1
}

function collectWallPlanes(
  meshes,
  {
    minVerticalSpan = MIN_VERTICAL_SPAN,
    minHorizontalSpan = MIN_HORIZONTAL_SPAN,
    minYMax = 0.1,
  } = {},
) {
  const xPlanes = []
  const zPlanes = []

  for (const object of meshes) {
    const geometry = object.geometry
    const position = geometry?.attributes?.position
    if (!position) continue

    object.updateWorldMatrix(true, false)
    const index = geometry.index
    const triangleCount = index ? index.count / 3 : position.count / 3

    for (let tri = 0; tri < triangleCount; tri += 1) {
      const ia = index ? index.getX(tri * 3) : tri * 3
      const ib = index ? index.getX(tri * 3 + 1) : tri * 3 + 1
      const ic = index ? index.getX(tri * 3 + 2) : tri * 3 + 2

      readWorldVertex(position, ia, object, _a)
      readWorldVertex(position, ib, object, _b)
      readWorldVertex(position, ic, object, _c)

      _ab.subVectors(_b, _a)
      _ac.subVectors(_c, _a)
      _normal.crossVectors(_ab, _ac)
      const normalLength = _normal.length()
      if (normalLength < 1e-6) continue
      _normal.divideScalar(normalLength)

      if (Math.abs(_normal.y) > 0.28) continue

      const xMin = Math.min(_a.x, _b.x, _c.x)
      const xMax = Math.max(_a.x, _b.x, _c.x)
      const yMin = Math.min(_a.y, _b.y, _c.y)
      const yMax = Math.max(_a.y, _b.y, _c.y)
      const zMin = Math.min(_a.z, _b.z, _c.z)
      const zMax = Math.max(_a.z, _b.z, _c.z)
      if (yMax - yMin < minVerticalSpan || yMax < minYMax) continue

      const xSpan = xMax - xMin
      const zSpan = zMax - zMin

      if (xSpan <= PLANE_THICKNESS && zSpan >= minHorizontalSpan && Math.abs(_normal.x) > 0.55) {
        addPlane(xPlanes, {
          coord: (xMin + xMax) / 2,
          spanMin: zMin,
          spanMax: zMax,
          yMin,
          yMax,
          sign: Math.sign(_normal.x),
        })
      } else if (zSpan <= PLANE_THICKNESS && xSpan >= minHorizontalSpan && Math.abs(_normal.z) > 0.55) {
        addPlane(zPlanes, {
          coord: (zMin + zMax) / 2,
          spanMin: xMin,
          spanMax: xMax,
          yMin,
          yMax,
          sign: Math.sign(_normal.z),
        })
      }
    }
  }

  return { xPlanes, zPlanes }
}

function hasJunction(junctions, x, z, fx, fz) {
  return junctions.some(
    ([jx, jz, jfx, jfz]) =>
      jfx === fx &&
      jfz === fz &&
      Math.abs(jx - x) <= PLANE_COORD_TOLERANCE &&
      Math.abs(jz - z) <= PLANE_COORD_TOLERANCE,
  )
}

function measureMainHallJunctions(meshes, fallbackBox) {
  const { xPlanes, zPlanes } = collectWallPlanes(meshes)
  const junctions = []

  for (const xPlane of xPlanes) {
    for (const zPlane of zPlanes) {
      const yOverlap = Math.min(xPlane.yMax, zPlane.yMax) - Math.max(xPlane.yMin, zPlane.yMin)
      if (yOverlap < MIN_VERTICAL_SPAN) continue
      if (zPlane.coord < xPlane.spanMin - SPAN_TOLERANCE || zPlane.coord > xPlane.spanMax + SPAN_TOLERANCE) {
        continue
      }
      if (xPlane.coord < zPlane.spanMin - SPAN_TOLERANCE || xPlane.coord > zPlane.spanMax + SPAN_TOLERANCE) {
        continue
      }
      if (hasJunction(junctions, xPlane.coord, zPlane.coord, xPlane.sign, zPlane.sign)) continue

      junctions.push([xPlane.coord, zPlane.coord, xPlane.sign, zPlane.sign])
    }
  }

  const sorted = junctions.sort((a, b) => a[1] - b[1] || a[0] - b[0])

  return {
    junctions: sorted
      .slice(0, MAX_JUNCTIONS)
      .map(([x, z, fx, fz]) => new THREE.Vector4(x, z, fx, fz)),
    yBottom: fallbackBox.min.y,
    yTop: fallbackBox.max.y,
    verticalFadeOut: 0.18,
    baseRadius: BASE_SHADOW_RADIUS,
    baseHeight: BASE_SHADOW_HEIGHT,
    baseStrength: BASE_SHADOW_STRENGTH,
    floorHeight: FLOOR_SHADOW_HEIGHT,
    floorStrength: FLOOR_SHADOW_STRENGTH,
    bottomEdgeHeight: BOTTOM_EDGE_HEIGHT,
    bottomEdgeStrength: BOTTOM_EDGE_STRENGTH,
    topEdgeHeight: TOP_EDGE_HEIGHT,
    topEdgeStrength: TOP_EDGE_STRENGTH,
  }
}

function planeLength(plane) {
  return plane.spanMax - plane.spanMin
}

function planesOverlap(a, b) {
  return a.spanMin <= b.spanMax + EDGE_PLANE_TOLERANCE && a.spanMax >= b.spanMin - EDGE_PLANE_TOLERANCE
}

function matchesTallPlane(plane, tallPlanes) {
  return tallPlanes.some(
    (candidate) =>
      candidate.sign === plane.sign &&
      Math.abs(candidate.coord - plane.coord) <= EDGE_PLANE_TOLERANCE &&
      planesOverlap(candidate, plane),
  )
}

// The ceiling overlays are physical translucent planes; keep them out of real light panels.
function collectCeilingLightBlockers(scene, hallBox) {
  const blockers = []
  const pad = 0.25
  const minCeilingY = hallBox.max.y - 0.12

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some((material) => CEILING_LIGHT_MATERIAL_PATTERN.test(material?.name ?? ''))) return

    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty() || box.max.y < minCeilingY) return
    if (
      box.max.x < hallBox.min.x - pad ||
      box.min.x > hallBox.max.x + pad ||
      box.max.z < hallBox.min.z - pad ||
      box.min.z > hallBox.max.z + pad
    ) {
      return
    }

    blockers.push({
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
    })
  })

  return blockers
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(([start, end]) => end - start > 1e-4)
    .sort((a, b) => a[0] - b[0])
  const merged = []

  for (const interval of sorted) {
    const previous = merged[merged.length - 1]
    if (!previous || interval[0] > previous[1]) {
      merged.push([...interval])
    } else {
      previous[1] = Math.max(previous[1], interval[1])
    }
  }

  return merged
}

function splitSpanByIntervals(spanMin, spanMax, intervals) {
  const blocked = mergeIntervals(
    intervals
      .map(([start, end]) => [Math.max(spanMin, start), Math.min(spanMax, end)])
      .filter(([start, end]) => end - start > 1e-4),
  )
  if (!blocked.length) return [[spanMin, spanMax]]

  const segments = []
  let cursor = spanMin
  for (const [start, end] of blocked) {
    if (start - cursor >= EDGE_OVERLAY_MIN_LENGTH) segments.push([cursor, start])
    cursor = Math.max(cursor, end)
  }
  if (spanMax - cursor >= EDGE_OVERLAY_MIN_LENGTH) segments.push([cursor, spanMax])
  return segments
}

function stripCrossRange(plane, width, inset) {
  const start = plane.coord + plane.sign * inset
  const end = plane.coord + plane.sign * (inset + width)
  return [Math.min(start, end), Math.max(start, end)]
}

function splitPlaneByCeilingLights(plane, axis, blockers, width, inset = 0) {
  if (!blockers.length) return [plane]

  const [crossMin, crossMax] = stripCrossRange(plane, width, inset)
  const intervals = []

  for (const blocker of blockers) {
    if (axis === 'x') {
      if (
        blocker.maxX < crossMin - CEILING_LIGHT_CLEARANCE ||
        blocker.minX > crossMax + CEILING_LIGHT_CLEARANCE
      ) {
        continue
      }
      intervals.push([
        blocker.minZ - CEILING_LIGHT_CLEARANCE,
        blocker.maxZ + CEILING_LIGHT_CLEARANCE,
      ])
    } else {
      if (
        blocker.maxZ < crossMin - CEILING_LIGHT_CLEARANCE ||
        blocker.minZ > crossMax + CEILING_LIGHT_CLEARANCE
      ) {
        continue
      }
      intervals.push([
        blocker.minX - CEILING_LIGHT_CLEARANCE,
        blocker.maxX + CEILING_LIGHT_CLEARANCE,
      ])
    }
  }

  return splitSpanByIntervals(plane.spanMin, plane.spanMax, intervals).map(([spanMin, spanMax]) => ({
    ...plane,
    spanMin,
    spanMax,
  }))
}

function splitPlanesByCeilingLights(planes, axis, blockers, width, inset = 0) {
  return planes.flatMap((plane) => splitPlaneByCeilingLights(plane, axis, blockers, width, inset))
}

function collectEdgeOverlayState(scene) {
  if (!scene) return null

  const wallMeshes = findWallMeshes(scene, MAIN_HALL_BOUNDS_MATERIALS, isMainHallWallMesh)
  if (!wallMeshes.length) return null

  const box = new THREE.Box3()
  wallMeshes.forEach((mesh) => box.expandByObject(mesh))
  if (box.isEmpty()) return null

  const edgeMeshes = findWallMeshes(scene, MAIN_HALL_EDGE_MATERIALS)
  if (!edgeMeshes.length) return null

  const tall = collectWallPlanes(edgeMeshes, {
    minVerticalSpan: 1.8,
    minHorizontalSpan: EDGE_OVERLAY_MIN_LENGTH,
    minYMax: 1.0,
  })
  const shallow = collectWallPlanes(edgeMeshes, {
    minVerticalSpan: 0.02,
    minHorizontalSpan: EDGE_OVERLAY_MIN_LENGTH,
    minYMax: -0.05,
  })

  const tallX = tall.xPlanes
  const tallZ = tall.zPlanes
  const bottomMaxY = box.min.y + 1.15
  const topMinY = box.max.y - 0.55
  const bottomX = shallow.xPlanes.filter(
    (plane) =>
      plane.yMin <= box.min.y + 0.35 &&
      plane.yMax <= bottomMaxY &&
      planeLength(plane) >= EDGE_OVERLAY_MIN_LENGTH &&
      matchesTallPlane(plane, tallX),
  )
  const bottomZ = shallow.zPlanes.filter(
    (plane) =>
      plane.yMin <= box.min.y + 0.35 &&
      plane.yMax <= bottomMaxY &&
      planeLength(plane) >= EDGE_OVERLAY_MIN_LENGTH &&
      matchesTallPlane(plane, tallZ),
  )
  const topX = shallow.xPlanes.filter(
    (plane) =>
      plane.yMax >= topMinY &&
      planeLength(plane) >= EDGE_OVERLAY_MIN_LENGTH &&
      matchesTallPlane(plane, tallX),
  )
  const topZ = shallow.zPlanes.filter(
    (plane) =>
      plane.yMax >= topMinY &&
      planeLength(plane) >= EDGE_OVERLAY_MIN_LENGTH &&
      matchesTallPlane(plane, tallZ),
  )
  const ceilingLightBlockers = collectCeilingLightBlockers(scene, box)
  const topXWithoutLights = splitPlanesByCeilingLights(
    topX,
    'x',
    ceilingLightBlockers,
    CEILING_STRIP_WIDTH,
    CEILING_EDGE_INSET,
  )
  const topZWithoutLights = splitPlanesByCeilingLights(
    topZ,
    'z',
    ceilingLightBlockers,
    CEILING_STRIP_WIDTH,
    CEILING_EDGE_INSET,
  )

  return {
    yBottom: box.min.y,
    yTop: box.max.y,
    bottomX,
    bottomZ,
    topX,
    topZ,
    topXWithoutLights,
    topZWithoutLights,
  }
}

function useEdgeShadowMaterials() {
  const materials = useMemo(
    () => ({
      verticalBottom: makeShadowMaterial('1.0 - smoothstep(0.0, 1.0, vUv.y)', 0.18),
      verticalTop: makeShadowMaterial('smoothstep(0.0, 1.0, vUv.y)', 0.16),
      floorU: makeShadowMaterial('1.0 - smoothstep(0.0, 1.0, vUv.x)', 0.16),
      floorUInv: makeShadowMaterial('smoothstep(0.0, 1.0, vUv.x)', 0.16),
      floorV: makeShadowMaterial('1.0 - smoothstep(0.0, 1.0, vUv.y)', 0.16),
      floorVInv: makeShadowMaterial('smoothstep(0.0, 1.0, vUv.y)', 0.16),
      ceilingU: makeShadowMaterial('1.0 - smoothstep(0.0, 1.0, vUv.x)', 0.085),
      ceilingUInv: makeShadowMaterial('smoothstep(0.0, 1.0, vUv.x)', 0.085),
      ceilingV: makeShadowMaterial('1.0 - smoothstep(0.0, 1.0, vUv.y)', 0.085),
      ceilingVInv: makeShadowMaterial('smoothstep(0.0, 1.0, vUv.y)', 0.085),
    }),
    [],
  )

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose())
    },
    [materials],
  )

  return materials
}

function VerticalEdgeStrip({ plane, y, height, top = false, material }) {
  const length = planeLength(plane)
  const center = (plane.spanMin + plane.spanMax) / 2
  const offset = plane.sign * EDGE_OVERLAY_OFFSET
  const position =
    plane.axis === 'x'
      ? [plane.coord + offset, y, center]
      : [center, y, plane.coord + offset]
  const rotation = plane.axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0]

  return (
    <mesh position={position} rotation={rotation} renderOrder={top ? 18 : 17}>
      <planeGeometry args={[length, height]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

function HorizontalEdgeStrip({ plane, y, width, material, renderOrder, inset = 0 }) {
  const length = planeLength(plane)
  const center = (plane.spanMin + plane.spanMax) / 2
  const position =
    plane.axis === 'x'
      ? [plane.coord + plane.sign * (inset + width / 2), y, center]
      : [center, y, plane.coord + plane.sign * (inset + width / 2)]
  const args = plane.axis === 'x' ? [width, length] : [length, width]

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} renderOrder={renderOrder}>
      <planeGeometry args={args} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

function MainHallEdgeShadowOverlays({ scene }) {
  const state = useMemo(() => collectEdgeOverlayState(scene), [scene])
  const materials = useEdgeShadowMaterials()
  if (!state) return null

  const bottomY = state.yBottom + BOTTOM_EDGE_HEIGHT / 2 + 0.01
  const topY = state.yTop - TOP_EDGE_HEIGHT / 2 - 0.01
  const floorY = state.yBottom + 0.052
  const ceilingY = state.yTop - 0.052

  return (
    <group>
      {state.bottomX.map((plane, index) => (
        <VerticalEdgeStrip
          key={`bottom-x-${index}`}
          plane={{ ...plane, axis: 'x' }}
          y={bottomY}
          height={BOTTOM_EDGE_HEIGHT}
          material={materials.verticalBottom}
        />
      ))}
      {state.bottomZ.map((plane, index) => (
        <VerticalEdgeStrip
          key={`bottom-z-${index}`}
          plane={{ ...plane, axis: 'z' }}
          y={bottomY}
          height={BOTTOM_EDGE_HEIGHT}
          material={materials.verticalBottom}
        />
      ))}
      {state.topXWithoutLights.map((plane, index) => (
        <VerticalEdgeStrip
          key={`top-x-${index}`}
          plane={{ ...plane, axis: 'x' }}
          y={topY}
          height={TOP_EDGE_HEIGHT}
          top
          material={materials.verticalTop}
        />
      ))}
      {state.topZWithoutLights.map((plane, index) => (
        <VerticalEdgeStrip
          key={`top-z-${index}`}
          plane={{ ...plane, axis: 'z' }}
          y={topY}
          height={TOP_EDGE_HEIGHT}
          top
          material={materials.verticalTop}
        />
      ))}
      {state.bottomX.map((plane, index) => (
        <HorizontalEdgeStrip
          key={`floor-x-${index}`}
          plane={{ ...plane, axis: 'x' }}
          y={floorY}
          width={FLOOR_STRIP_WIDTH}
          material={plane.sign > 0 ? materials.floorU : materials.floorUInv}
          renderOrder={15}
        />
      ))}
      {state.bottomZ.map((plane, index) => (
        <HorizontalEdgeStrip
          key={`floor-z-${index}`}
          plane={{ ...plane, axis: 'z' }}
          y={floorY}
          width={FLOOR_STRIP_WIDTH}
          material={plane.sign > 0 ? materials.floorV : materials.floorVInv}
          renderOrder={15}
        />
      ))}
      {state.topXWithoutLights.map((plane, index) => (
        <HorizontalEdgeStrip
          key={`ceiling-x-${index}`}
          plane={{ ...plane, axis: 'x' }}
          y={ceilingY}
          width={CEILING_STRIP_WIDTH}
          material={plane.sign > 0 ? materials.ceilingU : materials.ceilingUInv}
          renderOrder={16}
          inset={CEILING_EDGE_INSET}
        />
      ))}
      {state.topZWithoutLights.map((plane, index) => (
        <HorizontalEdgeStrip
          key={`ceiling-z-${index}`}
          plane={{ ...plane, axis: 'z' }}
          y={ceilingY}
          width={CEILING_STRIP_WIDTH}
          material={plane.sign > 0 ? materials.ceilingV : materials.ceilingVInv}
          renderOrder={16}
          inset={CEILING_EDGE_INSET}
        />
      ))}
    </group>
  )
}

export function MainHallCornerShadows({ scene }) {
  const mainHallEntry = useMemo(() => (scene ? getMainHallEntry(scene) : null), [scene])

  return (
    <>
      <HallCornerShadows
        scene={scene}
        hallEntry={mainHallEntry}
        wallMaterialNames={MAIN_HALL_MATERIALS}
        measureJunctions={measureMainHallJunctions}
        debugKey="__mainHallCornerShadows"
        meshFilter={isMainHallWallMesh}
        layerSeamTolerance={0.12}
      />
      <MainHallEdgeShadowOverlays scene={scene} />
    </>
  )
}
