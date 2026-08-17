import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { HALLS, getHallCanonicalCenter, projectHallLayoutToWorldPosition } from '../data/halls.js'

const HOTSPOT_WIDTH = 2.2
const HOTSPOT_HEIGHT = 1.6
const DEFAULT_DEPTH = 0.02
const DEFAULT_FILL = 'rgba(59, 130, 246, 0.15)'
const DEFAULT_BORDER = '#1e40af'
const PANEL_PLANE_TOLERANCE = 0.08 // 当某轴的厚度 < 该值时认为面板朝向该轴
const PANEL_DEPTH_AXIS_TOLERANCE = 0.45 // 同一组面板在法线轴上允许的最大偏移

export function WallHotspot({ data, markersRef, onSelect }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const hintTimeoutRef = useRef(null)

  const hotspotWidth = data.width ?? HOTSPOT_WIDTH
  const hotspotHeight = data.height ?? HOTSPOT_HEIGHT
  const depth = data.surfaceDepth ?? DEFAULT_DEPTH
  const fillColor = data.fillColor ?? DEFAULT_FILL
  const borderColor = data.borderColor ?? DEFAULT_BORDER

  // 将可点击平面、填充和边框轻微前推到墙面外侧，避免与模型墙发生 z-fight，
  // 也保证从背面看时不会出现“透过墙面”的黑色矩形。
  const surfaceOffset = Math.max(depth / 2 + 0.005, 0.012)

  const outlinePoints = useMemo(() => {
    const x = hotspotWidth / 2
    const y = hotspotHeight / 2
    return [
      [-x, -y, surfaceOffset],
      [ x, -y, surfaceOffset],
      [ x,  y, surfaceOffset],
      [-x,  y, surfaceOffset],
      [-x, -y, surfaceOffset],
    ]
  }, [hotspotWidth, hotspotHeight, surfaceOffset])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.userData.hotspot = data
    markersRef.current.push({ mesh, data })
    return () => {
      markersRef.current = markersRef.current.filter((item) => item.mesh !== mesh)
    }
  }, [data, markersRef])

  useEffect(
    () => () => {
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current)
      document.body.style.cursor = 'auto'
    },
    [],
  )

  const handlePointerEnter = () => {
    setHovered(true)
    document.body.style.cursor = 'pointer'
    hintTimeoutRef.current = setTimeout(() => setShowHint(true), 180)
  }

  const handlePointerLeave = () => {
    setHovered(false)
    setShowHint(false)
    document.body.style.cursor = 'auto'
    if (hintTimeoutRef.current) {
      clearTimeout(hintTimeoutRef.current)
    }
  }

  const handleClick = (event) => {
    event.stopPropagation()
    onSelect(data)
  }

  return (
    <group position={data.position} rotation={data.rotation || [0, 0, 0]}>
      <Line
        points={outlinePoints}
        color={borderColor}
        lineWidth={4}
        transparent
        opacity={hovered ? 1.0 : 0.9}
        depthWrite={false}
        depthTest={true}
        renderOrder={6}
      />

      {/* 单一热点平面：同时承担填充显示与点击拾取。
            depthTest=true + FrontSide 让它只在房间一侧可见，
            消除原来透明无背面平面在贴近时产生的黑色伪影，也避免从墙背面透出。 */}
      <mesh
        ref={meshRef}
        position={[0, 0, surfaceOffset]}
        renderOrder={5}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      >
        <planeGeometry args={[hotspotWidth, hotspotHeight]} />
        <meshBasicMaterial
          color={fillColor}
          transparent
          opacity={hovered ? 0.22 : 0.10}
          depthWrite={false}
          depthTest={true}
          side={THREE.FrontSide}
          toneMapped={false}
        />
      </mesh>



      {showHint && (
        <Html
          position={[0, hotspotHeight / 2 + 0.14, surfaceOffset + 0.05]}
          center
          zIndexRange={[960, 950]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              backgroundColor: 'rgba(30, 64, 175, 0.95)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            点击查看详情
          </div>
        </Html>
      )}
    </group>
  )
}

// 把网格转换成统一的面板描述，便于做平面检测。
function normalizePanelShape(object) {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return null
  const size = new THREE.Vector3()
  box.getSize(size)
  const center = new THREE.Vector3()
  box.getCenter(center)

  if (size.x <= PANEL_PLANE_TOLERANCE) {
    return { depthAxis: 'x', normalSign: center.x >= 0 ? 1 : -1, center, size, box }
  }
  if (size.z <= PANEL_PLANE_TOLERANCE) {
    return { depthAxis: 'z', normalSign: center.z >= 0 ? 1 : -1, center, size, box }
  }
  if (size.y <= PANEL_PLANE_TOLERANCE) {
    return { depthAxis: 'y', normalSign: center.y >= 0 ? 1 : -1, center, size, box }
  }
  return null
}

function axisValue(v, axis) {
  return axis === 'x' ? v.x : axis === 'y' ? v.y : v.z
}

// 将同一墙面、法线方向一致、且面内坐标彼此靠近的子面板合并为同一组。
function groupPanelsOnPlane(panels) {
  const groups = []
  for (const panel of panels) {
    const shape = panel.shape
    let host = null
    let bestDistance = Infinity
    for (const group of groups) {
      if (group.depthAxis !== shape.depthAxis) continue
      if (group.normalSign !== shape.normalSign) continue
      const axisDelta = Math.abs(axisValue(shape.center, shape.depthAxis) - group.depthCenter)
      if (axisDelta > PANEL_DEPTH_AXIS_TOLERANCE) continue
      const dist =
        axisDelta +
        Math.abs(shape.center.x - group.depthCenterX) +
        Math.abs(shape.center.y - group.depthCenterY)
      if (dist < bestDistance) {
        bestDistance = dist
        host = group
      }
    }

    if (!host) {
      groups.push({
        depthAxis: shape.depthAxis,
        normalSign: shape.normalSign,
        depthCenter: axisValue(shape.center, shape.depthAxis),
        depthCenterX: shape.center.x,
        depthCenterY: shape.center.y,
        bbox: shape.box.clone(),
        members: [panel],
      })
    } else {
      host.bbox.union(shape.box)
      host.members.push(panel)
      const total = host.members.length
      const prev = total - 1
      host.depthCenter =
        (host.depthCenter * prev + axisValue(shape.center, shape.depthAxis)) / total
      host.depthCenterX = (host.depthCenterX * prev + shape.center.x) / total
      host.depthCenterY = (host.depthCenterY * prev + shape.center.y) / total
    }
  }
  return groups
}

// 智能检测墙面上的面板，并将同一块版块内的子面板合并为整体热点。
function detectWallPanels(scene, wallDirection, hallBounds) {
  const wallNormal = new THREE.Vector3(wallDirection.x, 0, wallDirection.z).normalize()
  const panels = []

  console.log('[Panel Detection] Hall bounds:', hallBounds)
  console.log('[Panel Detection] Wall direction:', wallDirection)

  scene.traverse((object) => {
    if (object === scene || !object.geometry) return

    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return

    const size = new THREE.Vector3()
    box.getSize(size)
    const maxSize = Math.max(size.x, size.y, size.z)
    if (maxSize > 8 || maxSize < 0.3) return

    const center = new THREE.Vector3()
    box.getCenter(center)

    if (
      center.x < hallBounds.minX || center.x > hallBounds.maxX ||
      center.z < hallBounds.minZ || center.z > hallBounds.maxZ
    ) {
      return
    }
    if (size.y < 0.5 || size.y > 4) return

    const shape = normalizePanelShape(object)
    if (!shape) return

    const wantsX = Math.abs(wallNormal.x) > 0.5
    if (wantsX && shape.depthAxis !== 'x') return
    if (!wantsX && shape.depthAxis !== 'z') return

    const hallCenter = new THREE.Vector3(
      (hallBounds.minX + hallBounds.maxX) / 2,
      0,
      (hallBounds.minZ + hallBounds.maxZ) / 2,
    )
    const centerToHall = center.clone().sub(hallCenter).normalize()
    const dot = wallNormal.dot(centerToHall)
    if (Math.abs(dot) <= 0.5) return

    panels.push({
      object,
      center,
      size,
      box,
      name: object.name || 'unnamed',
      dot,
      shape,
    })
    console.log('[Panel Detection] Found potential panel:', object.name, 'Size:', size.x.toFixed(2), 'x', size.y.toFixed(2))
  })

  const grouped = groupPanelsOnPlane(panels)
  return grouped
    .map((group) => {
      const bbox = group.bbox
      const center = new THREE.Vector3()
      bbox.getCenter(center)
      const size = new THREE.Vector3()
      bbox.getSize(size)
      return {
        object: group.members[0].object,
        center,
        size,
        box: bbox,
        name: group.members.map((m) => m.name).join('+'),
        dot: group.members[0].dot,
        area: size.x * size.y + size.y * size.z + size.x * size.z,
        members: group.members,
      }
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, 3)
}

function canonicalWallDirection(data, hallDef) {
  const canonical = getHallCanonicalCenter(hallDef)
  if (data.wall === 'back') {
    return { x: 0, z: canonical.z >= 0 ? 1 : -1 }
  }
  if (data.wall === 'left' || data.wall === 'right') {
    return { x: data.wall === 'left' ? -1 : 1, z: 0 }
  }
  return null
}

function projectDirection(x, z, dx, dz, worldLayout) {
  const base = projectHallLayoutToWorldPosition(x, z, worldLayout)
  const toward = projectHallLayoutToWorldPosition(x + dx, z + dz, worldLayout)
  const vx = toward.x - base.x
  const vz = toward.z - base.z
  const length = Math.hypot(vx, vz)
  if (length < 1e-6) return null
  return { x: vx / length, z: vz / length }
}

// 按节点名直接定位模型中的版块（如广播厅的橙色展板 广播厅004），
// 完全贴合该版块的世界包围盒：位置取版块面中心，尺寸取版块实际宽高，朝向厅内。
// panelNames 传入多个节点名时取包围盒并集——用一个蓝框框住整面墙的全部海报。
function fitToNamedPanel(data, scene, hall) {
  const names = data.panelNames ?? (data.panelName ? [data.panelName] : null)
  if (!names) return null

  const box = new THREE.Box3()
  let matched = 0
  scene.traverse((item) => {
    if (!names.includes(item.name)) return
    const objectBox = new THREE.Box3().setFromObject(item)
    if (objectBox.isEmpty()) return
    box.union(objectBox)
    matched += 1
  })
  if (!matched) return null

  const center = new THREE.Vector3()
  box.getCenter(center)
  const size = new THREE.Vector3()
  box.getSize(size)

  // 法线按包围盒最薄轴取，保持框与墙面严格平行；
  // 厅心只用来判定朝向符号，避免“朝厅心倾斜”导致框边缘嵌入墙体。
  const depthAxis = size.x < size.z ? 'x' : 'z'
  const depth = Math.min(size.x, size.z)
  const width = depthAxis === 'x' ? size.z : size.x
  const hallAxisCenter =
    depthAxis === 'x' ? (hall.worldMinX + hall.worldMaxX) / 2 : (hall.worldMinZ + hall.worldMaxZ) / 2
  const centerAxisValue = depthAxis === 'x' ? center.x : center.z
  const normalSign = hallAxisCenter >= centerAxisValue ? 1 : -1
  const inRoom =
    depthAxis === 'x' ? new THREE.Vector3(normalSign, 0, 0) : new THREE.Vector3(0, 0, normalSign)

  const surface = center.clone().addScaledVector(inRoom, depth / 2 + 0.015)

  return {
    position: [surface.x, center.y, surface.z],
    rotationY: Math.atan2(inRoom.x, inRoom.z),
    width: THREE.MathUtils.clamp(width, 0.5, 10),
    height: THREE.MathUtils.clamp(size.y, 0.5, 5),
  }
}

function resolveExternalWallPlacement(data, hall, worldLayout, scene, raycaster) {
  // 数据中如果已经给定了 position 与 rotation, 就直接信任作者指定的坐标,
  // 避免自动检测把同一面墙上的多个面板误合并为一个巨大框。
  if (
    Array.isArray(data.position) &&
    data.position.length === 3 &&
    Array.isArray(data.rotation) &&
    data.rotation.length === 3 &&
    Number.isFinite(data.width) &&
    Number.isFinite(data.height)
  ) {
    return {
      position: data.position,
      rotationY: data.rotation[1] ?? 0,
      width: data.width,
      height: data.height,
    }
  }

  const hallDef = HALLS.find((item) => item.id === data.hallId)
  if (!hallDef) return null

  const namedPanel = fitToNamedPanel(data, scene, hall)
  if (namedPanel) return namedPanel

  const wallDir = canonicalWallDirection(data, hallDef)
  if (!wallDir) return null

  const hallBounds = {
    minX: hall.worldMinX,
    maxX: hall.worldMaxX,
    minZ: hall.worldMinZ,
    maxZ: hall.worldMaxZ,
  }

  // 智能检测墙上的面板
  const panels = detectWallPanels(scene, wallDir, hallBounds)

  if (panels.length > 0) {
    console.log('[Hotspot Placement] Using auto-detected panels for', data.id)
    const bestPanel = panels[0]
    console.log(
      '[Hotspot Placement] Selected panel:',
      bestPanel.name,
      'Size:',
      bestPanel.size.x.toFixed(2),
      'x',
      bestPanel.size.y.toFixed(2),
      'members:',
      bestPanel.members.length,
    )

    return {
      position: [
        bestPanel.center.x,
        bestPanel.center.y,
        bestPanel.center.z,
      ],
      rotationY: Math.atan2(-wallDir.x, -wallDir.z),
      width: bestPanel.size.x,
      height: bestPanel.size.y,
    }
  }

  // 如果没有找到面板，使用原来的射线检测逻辑
  console.log('[Hotspot Placement] No panels found, using raycast for', data.id)

  const canonical = getHallCanonicalCenter(hallDef)
  const direction = projectDirection(canonical.x, canonical.z, wallDir.x, wallDir.z, worldLayout)
  if (!direction) return null

  const centerX = (hall.worldMinX + hall.worldMaxX) / 2
  const centerZ = (hall.worldMinZ + hall.worldMaxZ) / 2
  const halfX = (hall.worldMaxX - hall.worldMinX) / 2
  const halfZ = (hall.worldMaxZ - hall.worldMinZ) / 2
  const height = Array.isArray(data.position) ? data.position[1] : 1.5
  const tangent = { x: -direction.z, z: direction.x }

  raycaster.far = Math.hypot(halfX, halfZ) + 0.5
  let wallDistance = 0
  let hitCount = 0

  const WALL_RAY_OFFSETS = [-0.6, 0, 0.6]

  for (const offset of WALL_RAY_OFFSETS) {
    raycaster.ray.origin.set(centerX + tangent.x * offset, height, centerZ + tangent.z * offset)
    raycaster.ray.direction.set(direction.x, 0, direction.z)
    const hits = raycaster.intersectObject(scene, true)

    const validHits = hits.filter((hit) => hit.distance > 0.1)

    if (validHits.length > 0) {
      wallDistance += validHits[0].distance
      hitCount++
    }
  }

  if (hitCount === 0) {
    wallDistance = (Math.abs(direction.x) > Math.abs(direction.z) ? halfX : halfZ) - 0.15
  } else {
    wallDistance = wallDistance / hitCount
  }

  const surfaceDepth = data.surfaceDepth ?? 0.02
  const forwardOffset = surfaceDepth / 2 + 0.01

  return {
    position: [
      centerX + direction.x * (wallDistance - forwardOffset),
      height,
      centerZ + direction.z * (wallDistance - forwardOffset),
    ],
    rotationY: Math.atan2(-direction.x, -direction.z),
  }
}

export function ExternalWallHotspots({ hotspots, worldLayout, markersRef, onSelect }) {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  const hotspotsRef = useRef(hotspots)
  hotspotsRef.current = hotspots

  const placed = useMemo(() => {
    if (!worldLayout) return []

    const raycaster = new THREE.Raycaster()
    raycaster.camera = camera
    raycaster.near = 0.1

    return hotspotsRef.current
      .map((data) => {
        const hall = worldLayout.halls.find((item) => item.id === data.hallId)
        if (!hall) return null

        try {
          const placement = resolveExternalWallPlacement(data, hall, worldLayout, scene, raycaster)
          if (!placement) return null

          return {
            ...data,
            position: placement.position,
            rotation: [0, placement.rotationY, 0],
            width: placement.width,
            height: placement.height,
          }
        } catch (error) {
          console.warn('[ExternalWallHotspots] Failed to place hotspot ' + data.id + ':', error)
          return null
        }
      })
      .filter(Boolean)
  }, [worldLayout, scene, camera])

  if (!placed.length) return null

  return placed.map((data) => (
    <WallHotspot key={data.id} data={data} markersRef={markersRef} onSelect={onSelect} />
  ))
}



