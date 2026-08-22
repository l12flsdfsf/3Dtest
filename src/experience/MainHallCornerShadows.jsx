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
// 墙顶竖条保持连续；天花侧压暗见 CeilingEdgeShadowMaterial（写进天花材质，无切分）。
const TOP_EDGE_STRENGTH = 0
const EDGE_OVERLAY_OFFSET = 0.012
const EDGE_OVERLAY_MIN_LENGTH = 0.8
const FLOOR_STRIP_WIDTH = 0.42
// 天花压暗（shader 版）：墙顶线两侧渐变半径/强度，与旧浮空贴片 0.38/0.085 对齐
const CEILING_EDGE_RADIUS = 0.38
const CEILING_EDGE_STRENGTH = 0.085
const CEILING_MAX_LINES = 24
// 荣誉展区（北墙奖杯墙 / 东墙荣誉篇章 + 西墙荣誉墙）天花不压暗：展陈墙面
// 自带照明，叠上天花暗带会显脏。按网格/材质名圈出展区 xz 范围，整条剔除命中
// 的墙顶线。西墙「荣誉墙」标题是墙身贴图、没有独立网格名，但与东墙「荣誉
// 篇章」关于大厅中线对称，故每个展区同时取其 x 镜像。
const HONOR_AREA_PATTERN = /荣誉篇章|奖杯/
const HONOR_AREA_MARGIN = 0.2
const EDGE_PLANE_TOLERANCE = 0.18

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

function addPlane(clusters, plane, mergeSpanGap = Infinity) {
  const existing = clusters.find(
    (cluster) =>
      cluster.sign === plane.sign &&
      Math.abs(cluster.coord - plane.coord) <= PLANE_COORD_TOLERANCE &&
      plane.spanMin <= cluster.spanMax + mergeSpanGap &&
      plane.spanMax >= cluster.spanMin - mergeSpanGap,
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
    mergeSpanGap = Infinity,
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
        addPlane(
          xPlanes,
          {
            coord: (xMin + xMax) / 2,
            spanMin: zMin,
            spanMax: zMax,
            yMin,
            yMax,
            sign: Math.sign(_normal.x),
          },
          mergeSpanGap,
        )
      } else if (zSpan <= PLANE_THICKNESS && xSpan >= minHorizontalSpan && Math.abs(_normal.z) > 0.55) {
        addPlane(
          zPlanes,
          {
            coord: (zMin + zMax) / 2,
            spanMin: xMin,
            spanMax: xMax,
            yMin,
            yMax,
            sign: Math.sign(_normal.z),
          },
          mergeSpanGap,
        )
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
  // 门洞侧壁（前墙 z≈24.7 上的 x±3.87 短垛，仅 ~1.2m 长）与墙身的交线不是
  // 房间墙角——按角落缝压暗会在门洞两侧各拉出一道通高竖向暗带。把量缝的
  // 最小水平跨度提到 1.5m，短垛就进不了交线求交（真实墙角都在 5m 以上）。
  const { xPlanes, zPlanes } = collectWallPlanes(meshes, { minHorizontalSpan: 1.5 })
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

  // 墙身台阶转角：荣誉墙与关怀厅门墙一类的前后错位处有一块 0.3~1.5m 的短
  // 回头面——太短进不了上面的求交，台阶的凸边/凹角便没有暗带，墙面显得
  // 「悬空」。细扫描回头面并与长墙配对补缝：从回头面朝向一侧起步的长墙与
  // 回头面成凸边（一条缝管两面）；回头面到头处的长墙成凹角（两条缝各管一面）。
  // mergeSpanGap 让东西两侧共面的回头面不跨厅合并成一条长缝。
  const fine = collectWallPlanes(meshes, {
    minVerticalSpan: 1.2,
    minHorizontalSpan: 0.25,
    mergeSpanGap: 0.3,
  })
  for (const returnPlane of fine.zPlanes) {
    const returnLength = returnPlane.spanMax - returnPlane.spanMin
    if (returnLength < 0.25 || returnLength >= 1.5) continue

    for (const xPlane of xPlanes) {
      const yOverlap = Math.min(xPlane.yMax, returnPlane.yMax) - Math.max(xPlane.yMin, returnPlane.yMin)
      if (yOverlap < 1.2) continue
      if (
        xPlane.coord < returnPlane.spanMin - SPAN_TOLERANCE ||
        xPlane.coord > returnPlane.spanMax + SPAN_TOLERANCE
      ) continue

      const startsAtReturn = Math.abs(returnPlane.coord - xPlane.spanMin) <= SPAN_TOLERANCE
      const endsAtReturn = Math.abs(returnPlane.coord - xPlane.spanMax) <= SPAN_TOLERANCE
      const withinWallSpan =
        returnPlane.coord >= xPlane.spanMin - SPAN_TOLERANCE &&
        returnPlane.coord <= xPlane.spanMax + SPAN_TOLERANCE
      const candidates = []
      // 凸边：长墙从回头面朝向的一侧起步（回头面 sign>0 朝 +z，则起步于 spanMin），
      // 且回头面落在长墙 span 上
      if (withinWallSpan && (returnPlane.sign > 0 ? startsAtReturn : endsAtReturn)) {
        candidates.push([xPlane.coord, returnPlane.coord, xPlane.sign, returnPlane.sign])
      }
      // 凹角：长墙面正是回头面的到头处（回头面 span 端 == 长墙 coord）。
      // 长墙自身可能差半米才到回头面（如关怀厅门口那段被金属门套包住），
      // 故这里不要求回头面落在长墙 span 内，只看端点对齐与竖向搭接。
      if (
        Math.abs(xPlane.coord - returnPlane.spanMin) <= SPAN_TOLERANCE ||
        Math.abs(xPlane.coord - returnPlane.spanMax) <= SPAN_TOLERANCE
      ) {
        candidates.push(
          [xPlane.coord, returnPlane.coord, -xPlane.sign, returnPlane.sign],
          [xPlane.coord, returnPlane.coord, xPlane.sign, -returnPlane.sign],
        )
      }
      for (const [x, z, fx, fz] of candidates) {
        if (!hasJunction(junctions, x, z, fx, fz)) junctions.push([x, z, fx, fz])
      }
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

function collectCeilingExclusionZones(scene) {
  const zones = []
  scene.traverse((object) => {
    if (!object.isMesh) return
    const materialNames = (Array.isArray(object.material) ? object.material : [object.material]).map(
      (material) => material?.name,
    )
    const names = [object.name, object.userData?.name, ...materialNames]
    if (!names.some((name) => typeof name === 'string' && HONOR_AREA_PATTERN.test(name))) return

    object.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return

    const zone = {
      minX: box.min.x - HONOR_AREA_MARGIN,
      maxX: box.max.x + HONOR_AREA_MARGIN,
      minZ: box.min.z - HONOR_AREA_MARGIN,
      maxZ: box.max.z + HONOR_AREA_MARGIN,
    }
    zones.push(zone)
    zones.push({ ...zone, minX: -zone.maxX, maxX: -zone.minX })
  })
  return zones
}

// 墙顶线是「固定 coord + 沿墙 span」的线段：coord 落进展区带内且 span 与展区
// 有交叠，即认定这条线沿荣誉展区墙面走，天花压暗整条剔除。
function planeHitsZone(plane, axis, zone) {
  const inCoordRange =
    axis === 'x'
      ? plane.coord >= zone.minX && plane.coord <= zone.maxX
      : plane.coord >= zone.minZ && plane.coord <= zone.maxZ
  const zoneSpanMin = axis === 'x' ? zone.minZ : zone.minX
  const zoneSpanMax = axis === 'x' ? zone.maxZ : zone.maxX
  return inCoordRange && plane.spanMax >= zoneSpanMin && plane.spanMin <= zoneSpanMax
}

function filterPlanesOutsideZones(planes, axis, zones) {
  if (!zones.length) return planes
  return planes.filter((plane) => !zones.some((zone) => planeHitsZone(plane, axis, zone)))
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

// 天花平板（如网格085_1：y5.34~5.74 的大块水平板）：高层 + 薄 + 大跨度。
function isCeilingSlabMesh(object) {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return false

  const size = box.getSize(new THREE.Vector3())
  return box.min.y > 4.5 && size.y < 1.5 && Math.max(size.x, size.z) >= 6
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
  // 墙身台阶的回头面太短（<EDGE_OVERLAY_MIN_LENGTH），上面的墙顶线收集收不进，
  // 台阶正面与天花的交界就会缺一段压暗（如关怀厅门口台阶上方）。细扫描补上
  // 回头面的墙顶线，并把端头对齐的相邻长墙线沿 z 延长到回头面处——长墙与
  // 回头面之间常有半米左右被金属门套包住的墙段，同样没有墙顶线。
  const returnTops = collectWallPlanes(edgeMeshes, {
    minVerticalSpan: 0.02,
    minHorizontalSpan: 0.25,
    minYMax: -0.05,
    mergeSpanGap: 0.3,
  }).zPlanes.filter(
    (plane) =>
      plane.yMax >= topMinY &&
      // yMin 限高：只收贴地的墙身回头面；天花灯槽/凹龛的端头小面悬在
      // yMin>2 的高处，混进来会把荣誉墙/荣誉篇章的天花重新压出一条条暗带
      plane.yMin <= 2.0 &&
      planeLength(plane) >= 0.25 &&
      planeLength(plane) < 1.5,
  )
  const returnTopZ = shallow.zPlanes
    .filter(
      (plane) =>
        plane.yMax >= topMinY &&
        planeLength(plane) >= EDGE_OVERLAY_MIN_LENGTH &&
        matchesTallPlane(plane, tallZ),
    )
    .concat(returnTops)

  const topX = shallow.xPlanes
    .filter(
      (plane) =>
        plane.yMax >= topMinY &&
        planeLength(plane) >= EDGE_OVERLAY_MIN_LENGTH &&
        matchesTallPlane(plane, tallX),
    )
    .map((plane) => {
      const bridged = { ...plane }
      for (const returnTop of returnTops) {
        const alignsAtMin = Math.abs(plane.coord - returnTop.spanMin) <= 0.55
        const alignsAtMax = Math.abs(plane.coord - returnTop.spanMax) <= 0.55
        if (!alignsAtMin && !alignsAtMax) continue
        bridged.spanMin = Math.min(bridged.spanMin, returnTop.coord)
        bridged.spanMax = Math.max(bridged.spanMax, returnTop.coord)
      }
      return bridged
    })
  const topZ = filterPlanesOutsideZones(returnTopZ, 'z', collectCeilingExclusionZones(scene))
  const topXFiltered = filterPlanesOutsideZones(topX, 'x', collectCeilingExclusionZones(scene))
  const ceilingMeshes = findWallMeshes(scene, MAIN_HALL_MATERIALS, isCeilingSlabMesh)

  return {
    yBottom: box.min.y,
    yTop: box.max.y,
    bottomX,
    bottomZ,
    topX: topXFiltered,
    topZ,
    ceilingMeshes,
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

function HorizontalEdgeStrip({ plane, y, width, material, renderOrder }) {
  const length = planeLength(plane)
  const center = (plane.spanMin + plane.spanMax) / 2
  const position =
    plane.axis === 'x'
      ? [plane.coord + plane.sign * (width / 2), y, center]
      : [center, y, plane.coord + plane.sign * (width / 2)]
  const args = plane.axis === 'x' ? [width, length] : [length, width]

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} renderOrder={renderOrder}>
      <planeGeometry args={args} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

// 天花压暗直接写进天花材质（onBeforeCompile）：按像素算到各墙顶线的距离，
// 连续无断口、贴合几何；灯带（白灯/顶部蓝）是独立网格材质，天然不受影响，
// 因此不再需要旧浮空贴片那套「按灯带切分避让」的逻辑。
function applyCeilingEdgeOcclusion(material, state) {
  const shadowMaterial = material.clone()
  shadowMaterial.onBeforeCompile = (shader) => {
    const xLines = state.topX
      .slice(0, CEILING_MAX_LINES)
      .map((plane) => new THREE.Vector4(plane.coord, plane.spanMin, plane.spanMax, plane.sign))
    const zLines = state.topZ
      .slice(0, CEILING_MAX_LINES)
      .map((plane) => new THREE.Vector4(plane.coord, plane.spanMin, plane.spanMax, plane.sign))
    while (xLines.length < CEILING_MAX_LINES) xLines.push(new THREE.Vector4())
    while (zLines.length < CEILING_MAX_LINES) zLines.push(new THREE.Vector4())
    shader.uniforms.ceilXLines = { value: xLines }
    shader.uniforms.ceilXCount = { value: Math.min(state.topX.length, CEILING_MAX_LINES) }
    shader.uniforms.ceilZLines = { value: zLines }
    shader.uniforms.ceilZCount = { value: Math.min(state.topZ.length, CEILING_MAX_LINES) }
    shader.uniforms.ceilEdgeRadius = { value: CEILING_EDGE_RADIUS }
    shader.uniforms.ceilEdgeStrength = { value: CEILING_EDGE_STRENGTH }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCeilWorldPos;\nvarying vec3 vCeilWorldNormal;',
      )
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvCeilWorldNormal = normalize(mat3(modelMatrix) * objectNormal);',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvCeilWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCeilWorldPos;
varying vec3 vCeilWorldNormal;
uniform vec4 ceilXLines[${CEILING_MAX_LINES}];
uniform int ceilXCount;
uniform vec4 ceilZLines[${CEILING_MAX_LINES}];
uniform int ceilZCount;
uniform float ceilEdgeRadius;
uniform float ceilEdgeStrength;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `// 每条墙顶线一个 (面coord, 沿向spanMin, spanMax, 朝内法向sign)：
// d = 像点到墙面的水平距离，along 限定线段范围，多线取最大遮蔽。
float ceilOcc = 0.0;
for (int i = 0; i < ceilXCount; i++) {
  vec4 ceilL = ceilXLines[i];
  float ceilD = ceilL.w * (vCeilWorldPos.x - ceilL.x);
  float ceilAlong = step(ceilL.y, vCeilWorldPos.z) * step(vCeilWorldPos.z, ceilL.z);
  ceilOcc = max(ceilOcc, (1.0 - smoothstep(0.0, ceilEdgeRadius, ceilD)) * step(0.0, ceilD) * ceilAlong);
}
for (int i = 0; i < ceilZCount; i++) {
  vec4 ceilL = ceilZLines[i];
  float ceilD = ceilL.w * (vCeilWorldPos.z - ceilL.x);
  float ceilAlong = step(ceilL.y, vCeilWorldPos.x) * step(vCeilWorldPos.x, ceilL.z);
  ceilOcc = max(ceilOcc, (1.0 - smoothstep(0.0, ceilEdgeRadius, ceilD)) * step(0.0, ceilD) * ceilAlong);
}
float ceilFace = 1.0 - step(-0.5, vCeilWorldNormal.y);
outgoingLight *= 1.0 - ceilOcc * ceilFace * ceilEdgeStrength;
#include <opaque_fragment>`,
      )
  }
  shadowMaterial.customProgramCacheKey = () => 'main-hall-ceiling-edge-v1'
  shadowMaterial.needsUpdate = true
  return shadowMaterial
}

// 给天花网格换装压暗材质；window.__mainHallCeilingShadows.toggle 供 A/B 截图对比。
function CeilingEdgeShadowMaterial({ state }) {
  useEffect(() => {
    if (!state || !state.ceilingMeshes.length) return undefined

    const entries = state.ceilingMeshes
      .map((mesh) => {
        const originalMaterial = mesh.material
        const originals = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]
        const disposables = []
        const patched = originals.map((material) => {
          if (!MAIN_HALL_MATERIALS.includes(material?.name)) return material
          const shadowMaterial = applyCeilingEdgeOcclusion(material, state)
          disposables.push(shadowMaterial)
          return shadowMaterial
        })
        if (!disposables.length) return null
        mesh.material = Array.isArray(originalMaterial) ? patched : patched[0]
        return { mesh, originalMaterial, patched, disposables }
      })
      .filter(Boolean)
    if (!entries.length) return undefined

    let enabled = true
    const apply = (on) => {
      entries.forEach(({ mesh, originalMaterial, patched }) => {
        mesh.material = on
          ? Array.isArray(originalMaterial) ? patched : patched[0]
          : originalMaterial
      })
    }
    if (typeof window !== 'undefined') {
      window.__mainHallCeilingShadows = {
        toggle: () => {
          enabled = !enabled
          apply(enabled)
          return enabled ? 'on' : 'off'
        },
        lines: {
          topX: state.topX.map((p) => ({ coord: +p.coord.toFixed(2), span: [p.spanMin, p.spanMax].map((v) => +v.toFixed(2)), sign: p.sign })),
          topZ: state.topZ.map((p) => ({ coord: +p.coord.toFixed(2), span: [p.spanMin, p.spanMax].map((v) => +v.toFixed(2)), sign: p.sign })),
        },
      }
    }

    return () => {
      if (typeof window !== 'undefined') delete window.__mainHallCeilingShadows
      entries.forEach(({ mesh, originalMaterial, disposables }) => {
        mesh.material = originalMaterial
        disposables.forEach((material) => material.dispose())
      })
    }
  }, [state])

  return null
}

function MainHallEdgeShadowOverlays({ scene }) {
  const state = useMemo(() => collectEdgeOverlayState(scene), [scene])
  const materials = useEdgeShadowMaterials()
  if (!state) return null

  const bottomY = state.yBottom + BOTTOM_EDGE_HEIGHT / 2 + 0.01
  const topY = state.yTop - TOP_EDGE_HEIGHT / 2 - 0.01
  const floorY = state.yBottom + 0.052

  return (
    <group>
      <CeilingEdgeShadowMaterial state={state} />
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
      {/* 墙顶竖条贴墙面、位于天花灯带下方，连续不断——若按灯带切缝（奖杯墙中央
          正对 polySurface91 长灯带），墙顶暗带会在 ±6.4m 处突然消失，留下断层 */}
      {state.topX.map((plane, index) => (
        <VerticalEdgeStrip
          key={`top-x-${index}`}
          plane={{ ...plane, axis: 'x' }}
          y={topY}
          height={TOP_EDGE_HEIGHT}
          top
          material={materials.verticalTop}
        />
      ))}
      {state.topZ.map((plane, index) => (
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
