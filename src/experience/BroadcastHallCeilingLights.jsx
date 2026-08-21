import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

// 广播厅天花一排 3 个圆形吸顶灯盘（网格076，材质 白灯.001，世界 y≈5.3，沿厅
// 中线均布）：灯盘自发光，但厅内没有任何真实光源与之对应（Lights.jsx 的灯组
// 都在 canonical 原点附近，照不到外部模型里的广播厅），地面看不到光池。
// 这里在加载后用射线从下往天花打 /白灯/ 材质网格，把命中点聚类成「可见灯盘」
// （朝下的盘才有命中；朝上的大发光板 网格071_1 无命中，自然排除），每个盘下
// 方放一盏朝下的软边聚光灯，在地面/展台上形成与灯盘位置对应的光池。
// 不开阴影：全场景阴影灯已 2 盏，新增非阴影灯不占阴影纹理槽（真机安全）。

// 灯盘识别参数（世界米制）
const LAMP_MATERIAL_PATTERN = /白灯/
const RAY_ORIGIN_Y = 4.55 // 射线起点：低于天花灯带(4.82)、高于厅内家具(≤4.21)
const RAY_FAR = 2.2
const RAY_STEP = 0.1 // 采样步长：盘径 ~0.2m，每盘约 3 个命中点
const CLUSTER_LINK_DISTANCE = 0.3 // 命中点连通阈值
const MAX_DISC_SPAN = 1.2 // 簇跨度上限：超过判定为大发光板，丢弃

// 光池参数（强度经 A/B 像素扫描标定：160 时站立视角 ~21% 画面增亮、
// 中心 +26/255，清晰但偏亮，按观感调淡到 130；厅内地板材质自带 emissive
// 底光，低强度会被底光吃掉几乎不可见）
const SPOT = {
  offsetY: -0.68, // 灯位下移到吊挂格栅(4.82)之下：高强度下贴着黑格栅会烤出亮边
  angle: 0.55, // 半角：落地光池半径 ≈ 4.62 × tan(0.55) ≈ 2.8m（相邻池叠成连续光带）
  penumbra: 0.78,
  intensity: 130,
  distance: 9,
  decay: 2,
  color: '#fbfcf8',
}

function clusterPoints(points) {
  // 空间哈希 + 深度优先连通域；points: [{x, z, y}]
  const cell = CLUSTER_LINK_DISTANCE
  const keyOf = (x, z) => Math.round(x / cell) + ':' + Math.round(z / cell)
  const grid = new Map()
  points.forEach((point, index) => {
    const key = keyOf(point.x, point.z)
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push(index)
  })

  const visited = new Array(points.length).fill(false)
  const clusters = []
  for (let start = 0; start < points.length; start += 1) {
    if (visited[start]) continue
    visited[start] = true
    const members = [start]
    for (let cursor = 0; cursor < members.length; cursor += 1) {
      const { x, z } = points[members[cursor]]
      const gx = Math.round(x / cell)
      const gz = Math.round(z / cell)
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const neighbor of grid.get(gx + dx + ':' + (gz + dz)) ?? []) {
            if (visited[neighbor]) continue
            const other = points[neighbor]
            if (Math.hypot(other.x - x, other.z - z) > cell * 1.5) continue
            visited[neighbor] = true
            members.push(neighbor)
          }
        }
      }
    }
    clusters.push(members)
  }
  return clusters
}

function findLampDiscs(scene, hallEntry) {
  if (!scene || !hallEntry) return []

  // 厅界内天花带的 /白灯/ 材质网格（广播厅：3 个圆盘 网格076 + 朝上的大发光板 网格071_1）
  const pad = 0.6
  const meshes = []
  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some((material) => LAMP_MATERIAL_PATTERN.test(material?.name ?? ''))) return

    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty() || box.max.y < 4.0) return
    if (
      box.min.x > hallEntry.worldMaxX + pad ||
      box.max.x < hallEntry.worldMinX - pad ||
      box.min.z > hallEntry.worldMaxZ + pad ||
      box.max.z < hallEntry.worldMinZ - pad
    ) {
      return
    }
    meshes.push(object)
  })
  if (!meshes.length) return []

  // 从下往上打射线：只有朝下可见的灯盘有命中
  const raycaster = new THREE.Raycaster()
  raycaster.far = RAY_FAR
  const direction = new THREE.Vector3(0, 1, 0)
  const hits = []
  for (let x = hallEntry.worldMinX - pad; x <= hallEntry.worldMaxX + pad; x += RAY_STEP) {
    for (let z = hallEntry.worldMinZ - pad; z <= hallEntry.worldMaxZ + pad; z += RAY_STEP) {
      raycaster.set(new THREE.Vector3(x, RAY_ORIGIN_Y, z), direction)
      const intersections = raycaster.intersectObjects(meshes, false)
      if (intersections.length) {
        hits.push({ x: intersections[0].point.x, z: intersections[0].point.z, y: intersections[0].point.y })
      }
    }
  }

  return clusterPoints(hits)
    .map((members) => {
      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      let ySum = 0
      for (const index of members) {
        const point = hits[index]
        minX = Math.min(minX, point.x)
        maxX = Math.max(maxX, point.x)
        minZ = Math.min(minZ, point.z)
        maxZ = Math.max(maxZ, point.z)
        ySum += point.y
      }
      return {
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
        y: ySum / members.length,
        span: Math.max(maxX - minX, maxZ - minZ),
        count: members.length,
      }
    })
    .filter((disc) => disc.span <= MAX_DISC_SPAN)
    .sort((a, b) => a.x - b.x)
}

// 自带朝向目标的聚光灯（与 Lights.jsx 的 AimedSpotLight 同套路，避免跨文件
// 依赖：Lights.jsx 由其它工作线并行维护）
function AimedSpotLight({ target, ...props }) {
  const lightRef = useRef(null)
  const targetRef = useRef(null)

  useLayoutEffect(() => {
    if (!lightRef.current || !targetRef.current) return
    lightRef.current.target = targetRef.current
    targetRef.current.updateMatrixWorld()
  }, [])

  return (
    <>
      <object3D ref={targetRef} position={target} />
      <spotLight ref={lightRef} {...props} />
    </>
  )
}

// 挂载在 Experience 里（不在 GltfModel 内）：worldLayout 就绪时 GLTF 已附加到
// R3F 根场景，这里自取根场景遍历，避免与并行维护的 GltfModel.jsx 产生编辑冲突。
export function BroadcastHallCeilingLights({ worldLayout }) {
  const scene = useThree((state) => state.scene)
  const hallEntry = worldLayout?.halls?.find((entry) => entry.id === 'broadcast')
  const discs = useMemo(() => findLampDiscs(scene, hallEntry), [scene, hallEntry])
  const [enabled, setEnabled] = useState(true)

  // window.__broadcastCeilingLights = { toggle, discs } 供自动化截图对比（生产无副作用）
  useEffect(() => {
    if (typeof window === 'undefined' || !discs.length) return undefined
    const toggle = () => setEnabled((value) => !value)
    window.__broadcastCeilingLights = { toggle, discs }
    return () => {
      if (window.__broadcastCeilingLights?.toggle === toggle) delete window.__broadcastCeilingLights
    }
  }, [discs])

  if (!discs.length || !enabled) return null

  return (
    <>
      {discs.map((disc, index) => (
        <AimedSpotLight
          key={index}
          position={[disc.x, disc.y + SPOT.offsetY, disc.z]}
          target={[disc.x, 0, disc.z]}
          angle={SPOT.angle}
          penumbra={SPOT.penumbra}
          intensity={SPOT.intensity}
          distance={SPOT.distance}
          decay={SPOT.decay}
          color={SPOT.color}
        />
      ))}
    </>
  )
}
