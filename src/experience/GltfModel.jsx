import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Html, useGLTF } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import { Octree } from 'three/examples/jsm/math/Octree.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { CONFIG } from '../data/config.js'
import { HALLS, getHallCanonicalCenter } from '../data/halls.js'
import { CLICKABLE_EXHIBITS, EXHIBIT_EXCLUDES, MESH_NAME_TO_EXHIBIT, getExhibitInfo } from '../data/exhibits.js'
import { findMaterialPicture, findPictureTexture, textureToPhoto } from './pictureTexture.js'
import { TechHallCornerShadows } from './TechHallCornerShadows.jsx'
import { CareHallCornerShadows } from './CareHallCornerShadows.jsx'
import { MainHallCornerShadows } from './MainHallCornerShadows.jsx'
import { RectHallsCornerShadows } from './RectHallsCornerShadows.jsx'

function listMaterialNames(material) {
  if (!material) return []
  const materials = Array.isArray(material) ? material : [material]
  return materials
    .map((item) => (typeof item?.name === 'string' ? item.name.trim() : ''))
    .filter(Boolean)
}

function objectNameMatchesHall(object, hallName) {
  const objectName = typeof object?.name === 'string' ? object.name.trim() : ''
  if (objectName.startsWith(hallName) || objectName.includes(hallName)) return true

  const userDataName = typeof object?.userData?.name === 'string' ? object.userData.name.trim() : ''
  if (userDataName.startsWith(hallName) || userDataName.includes(hallName)) return true

  return false
}

function objectMaterialMatchesHall(object, hallName) {
  return listMaterialNames(object?.material).some((name) => name.includes(hallName))
}

function objectMatchesLabel(object, label) {
  return objectNameMatchesHall(object, label) || objectMaterialMatchesHall(object, label)
}

function buildNamedAnchor(scene, label) {
  const box = new THREE.Box3()
  let matched = false

  scene.traverse((object) => {
    if (object === scene) return
    if (!objectMatchesLabel(object, label)) return

    const objectBox = new THREE.Box3().setFromObject(object)
    if (objectBox.isEmpty()) return

    box.union(objectBox)
    matched = true
  })

  if (!matched || box.isEmpty()) return null

  const center = new THREE.Vector3()
  box.getCenter(center)

  return {
    x: center.x,
    y: center.y,
    z: center.z,
  }
}

function buildSceneAnchors(scene) {
  return {
    honorChapter: buildNamedAnchor(scene, '荣誉篇章'),
    trophyArea: buildNamedAnchor(scene, '奖杯'),
  }
}

function solveLinear3(system, values) {
  const matrix = system.map((row, index) => [...row, values[index]])
  const size = matrix.length

  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[best][pivot])) best = row
    }

    if (Math.abs(matrix[best][pivot]) < 1e-8) return null
    if (best !== pivot) [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]]

    const factor = matrix[pivot][pivot]
    for (let column = pivot; column <= size; column += 1) {
      matrix[pivot][column] /= factor
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue
      const scale = matrix[row][pivot]
      if (Math.abs(scale) < 1e-8) continue

      for (let column = pivot; column <= size; column += 1) {
        matrix[row][column] -= scale * matrix[pivot][column]
      }
    }
  }

  return matrix.map((row) => row[size])
}

function determinant3(rows) {
  const [[a, b, c], [d, e, f], [g, h, i]] = rows
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
}

function buildLayoutTransform(hallBoxes) {
  if (hallBoxes.length < 3) return null

  const pairs = hallBoxes
    .map((layoutHall) => {
      const hall = HALLS.find((item) => item.id === layoutHall.id)
      if (!hall) return null

      const canonical = getHallCanonicalCenter(hall)
      return {
        world: [layoutHall.centerX, layoutHall.centerZ, 1],
        canonical,
      }
    })
    .filter(Boolean)

  if (pairs.length < 3) return null

  let triplet = null
  let bestDeterminant = 0

  for (let i = 0; i < pairs.length - 2; i += 1) {
    for (let j = i + 1; j < pairs.length - 1; j += 1) {
      for (let k = j + 1; k < pairs.length; k += 1) {
        const candidate = [pairs[i], pairs[j], pairs[k]]
        const determinant = Math.abs(determinant3(candidate.map((pair) => pair.world)))
        if (determinant > bestDeterminant) {
          bestDeterminant = determinant
          triplet = candidate
        }
      }
    }
  }

  if (!triplet || bestDeterminant < 1e-8) return null

  const system = triplet.map((pair) => pair.world)
  const xValues = triplet.map((pair) => pair.canonical.x)
  const zValues = triplet.map((pair) => pair.canonical.z)
  const xCoefficients = solveLinear3(system, xValues)
  const zCoefficients = solveLinear3(system, zValues)

  if (!xCoefficients || !zCoefficients) return null

  const projectionError = pairs.reduce((max, pair) => {
    const mappedX =
      xCoefficients[0] * pair.world[0] + xCoefficients[1] * pair.world[1] + xCoefficients[2]
    const mappedZ =
      zCoefficients[0] * pair.world[0] + zCoefficients[1] * pair.world[1] + zCoefficients[2]
    const dx = Math.abs(mappedX - pair.canonical.x)
    const dz = Math.abs(mappedZ - pair.canonical.z)
    return Math.max(max, dx, dz)
  }, 0)

  if (projectionError > 2.5) return null

  return {
    x: xCoefficients,
    z: zCoefficients,
  }
}

function buildWorldLayout(scene) {
  const hallBoxes = HALLS.map((hall) => {
    const nameMatches = []
    scene.traverse((object) => {
      if (object === scene) return
      if (!objectNameMatchesHall(object, hall.name)) return
      nameMatches.push(object)
    })

    const matches = nameMatches.length
      ? nameMatches
      : (() => {
          const materialMatches = []
          scene.traverse((object) => {
            if (object === scene) return
            if (!objectMaterialMatchesHall(object, hall.name)) return
            materialMatches.push(object)
          })
          return materialMatches
        })()

    if (!matches.length) return null

    const box = new THREE.Box3()
    matches.forEach((object) => {
      const objectBox = new THREE.Box3().setFromObject(object)
      if (!objectBox.isEmpty()) box.union(objectBox)
    })
    if (box.isEmpty()) return null

    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    return {
      id: hall.id,
      name: hall.name,
      centerX: center.x,
      centerZ: center.z,
      sizeX: size.x,
      sizeZ: size.z,
      worldMinX: box.min.x,
      worldMaxX: box.max.x,
      worldMinZ: box.min.z,
      worldMaxZ: box.max.z,
    }
  }).filter(Boolean)

  if (hallBoxes.length < 4) return null

  const transform = buildLayoutTransform(hallBoxes)

  const baseHalfWidth = CONFIG.hall.width / 2
  const baseHalfDepth = CONFIG.hall.depth / 2
  const xValues = hallBoxes.map((hall) => hall.centerX)
  const zValues = hallBoxes.map((hall) => hall.centerZ)
  const centerX = (Math.min(...xValues) + Math.max(...xValues)) / 2
  const centerZ = (Math.min(...zValues) + Math.max(...zValues)) / 2
  const avgHalfHallWidth = hallBoxes.reduce((sum, hall) => sum + hall.sizeX / 2, 0) / hallBoxes.length
  const avgHalfHallDepth = hallBoxes.reduce((sum, hall) => sum + hall.sizeZ / 2, 0) / hallBoxes.length
  const halfWidth = Math.max(...hallBoxes.map((hall) => Math.abs(hall.centerX - centerX) + hall.sizeX / 2), avgHalfHallWidth)
  const halfDepth = Math.max(...hallBoxes.map((hall) => Math.abs(hall.centerZ - centerZ) + hall.sizeZ / 2), avgHalfHallDepth)

  return {
    centerX,
    centerZ,
    halfWidth,
    halfDepth,
    transform,
    halls: hallBoxes.map((hall) => {
      const mapped = transform
        ? {
            x: transform.x[0] * hall.centerX + transform.x[1] * hall.centerZ + transform.x[2],
            z: transform.z[0] * hall.centerX + transform.z[1] * hall.centerZ + transform.z[2],
          }
        : {
            x: ((hall.centerX - centerX) * baseHalfWidth) / halfWidth,
            z: ((hall.centerZ - centerZ) * baseHalfDepth) / halfDepth,
          }

      return {
        id: hall.id,
        name: hall.name,
        x: mapped.x,
        z: mapped.z,
        sizeX: (hall.sizeX * baseHalfWidth) / halfWidth,
        sizeZ: (hall.sizeZ * baseHalfDepth) / halfDepth,
        worldMinX: hall.worldMinX,
        worldMaxX: hall.worldMaxX,
        worldMinZ: hall.worldMinZ,
        worldMaxZ: hall.worldMaxZ,
      }
    }),
  }
}

const sceneLayoutCache = new WeakMap()
let ktx2TargetLogged = false

// 高清屏面板贴图(按贴图名匹配):源图在 models-src/0817/,经 sharp 处理后放
// public/models/panel-hires/。见 GltfModel 内 panelHires effect 的注释。
const PANEL_HIRES_TEXTURES = {
  '2屏内容': '/models/panel-hires/screen2-2x.jpg',
  '3屏内容': '/models/panel-hires/screen3-4k.jpg',
  '4屏内容（保持不变）': '/models/panel-hires/screen4.jpg',
}
// 模型资源缺陷兜底：场景里每个厅有一块深灰无贴图的"遮挡盒"（材质 phong1：
// 关怀厅.020 / 电视厅.024 / 电影厅.014 / 技术设备厅.025 / 展望厅.016），
// 其几何比海报墙的正面还靠前约 3cm，把整面墙的照片海报挡成黑墙。
// 资源侧修复（Blender 里删除后重新导出）前，加载后直接从场景移除，
// 同时避免其参与碰撞体与点击射线。
function removeOccludingBlankPanels(scene) {
  const doomed = []
  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const isBlankPanel = materials.length > 0 && materials.every(
      (material) => material && material.name === 'phong1' && !material.map && !material.emissiveMap,
    )
    if (isBlankPanel) doomed.push(object)
  })
  for (const object of doomed) object.parent?.remove(object)
  if (doomed.length) {
    console.info(`[gltf] 已移除 ${doomed.length} 块遮挡海报的空白暗盒: ${doomed.map((o) => o.name).join(', ')}`)
  }
  return doomed.length
}

// scene-site1.glb 中 pCube178.001 不是展柜玻璃，而是覆盖整个技术厅的误导出玻璃体：
// 世界范围约 10.53 x 1.07 x 13.07m，Y=0.724~1.792，正好贯穿玩家视线和胶囊。
// GLTFLoader 会把节点名净化为 pCube178001，因此统一去掉分隔符后匹配。必须在
// 布局、点击射线和碰撞树构建前移除，避免透明遮挡、全厅碰撞回推和额外透明过绘。
const TECH_HALL_BLOCKER_KEYS = new Set(['pcube178001'])

function normalizeMeshName(name) {
  return typeof name === 'string' ? name.replace(/[._-]/g, '').toLowerCase() : ''
}

function removeTechHallTransparentBlockers(scene) {
  const removed = []

  scene.traverse((object) => {
    const normalizedName = normalizeMeshName(object.name)
    if (!object.isMesh || !TECH_HALL_BLOCKER_KEYS.has(normalizedName)) return
    removed.push(object)
  })

  for (const object of removed) object.parent?.remove(object)
  if (removed.length) {
    console.info(
      `[gltf] 已移除 ${removed.length} 个技术厅误导出透明遮挡体: ${removed.map((object) => object.name).join(', ')}`,
    )
  }
  return removed.length
}

// The source material relies on a Unity reflection probe that is not present
// in this renderer. Keep the glass locally bright without reintroducing a
// scene-wide environment map or a view-dependent white reflection.
function fixShowcaseGlassMaterials(scene) {
  let fixed = 0
  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!material || !['玻璃', '玻璃_9eea6', '电视厅玻璃'].includes(material.name)) continue
      material.transparent = true
      material.depthWrite = false
      material.metalness = 0
      material.roughness = 0.72
      material.envMapIntensity = 0.04
      material.color.setScalar(0.86)
      material.opacity = 0.16
      material.needsUpdate = true
      fixed += 1
    }
  })
  if (fixed) console.info(`[gltf] 已修复 ${fixed} 处展柜玻璃材质（低反射清玻璃）`)
  return fixed
}

function brightenShowcaseDisplayMaterials(scene) {
  const emissiveBoosts = new Map([
    ['电影厅展柜白磨砂', 1],
    ['电影厅展柜红', 1],
    ['技术设备厅展台', 1],
    ['展示柜展望厅', 0.82],
    ['phong15', 1],
    ['phong16', 1],
    ['phong17', 1],
  ])
  const solidColorFixes = new Map([
    ['展示柜橙展望厅', '#b58a58'],
  ])
  let fixed = 0

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!material) continue

      const emissiveScalar = emissiveBoosts.get(material.name)
      if (emissiveScalar !== undefined) {
        if (material.emissive) material.emissive.setScalar(emissiveScalar)
        material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 1, 1)
        if (typeof material.metalness === 'number') {
          material.metalness = Math.min(material.metalness, 0.22)
        }
        material.needsUpdate = true
        fixed += 1
      }

      const color = solidColorFixes.get(material.name)
      if (color && material.color) {
        material.color.set(color)
        material.roughness = Math.min(material.roughness ?? 0.5, 0.46)
        material.needsUpdate = true
        fixed += 1
      }
    }
  })

  if (fixed) console.info(`[gltf] 已调亮 ${fixed} 处展柜/展台材质`)
  return fixed
}

// 自发光面板（大屏、照片墙、展板灯箱）不吃环境反射：它们靠 emissive 自照明，
// IBL 的镜面反射只会在画面上罩一层白纱，让视频/照片看起来发灰发蒙。
function fixTechDeviceLostMaterials(scene) {
  const darkDeviceMaterials = new Set([
    'Material.012',
    'tripo_mat_6413779d-70e2-4139-825e-aa515461d8bd',
    'tripo_mat_3d1299e9-2705-4a17-97e7-cc70d7ddeb4a',
  ])
  let fixed = 0

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!material || !darkDeviceMaterials.has(material.name) || material.map) continue

      if (material.color) material.color.set('#18191b')
      if (typeof material.metalness === 'number') material.metalness = 0.08
      if (typeof material.roughness === 'number') material.roughness = 0.78
      material.needsUpdate = true
      fixed += 1
    }
  })

  if (fixed) console.info(`[gltf] restored dark fallback on ${fixed} tech-device materials`)
  return fixed
}

function suppressEnvReflectionOnEmissivePanels(scene) {
  let count = 0
  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!material?.emissiveMap || material.envMapIntensity === 0) continue
      material.envMapIntensity = 0
      count += 1
    }
  })
  if (count) console.info(`[gltf] 已关闭 ${count} 处自发光面板的环境反射`)
  return count
}

const UNLIT_PICTURE_MATERIAL = 'unlitPicturePanel'

function makePicturePanelsUnlit(scene) {
  const replacements = new Map()
  let count = 0

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    let changed = false
    const nextMaterials = materials.map((material) => {
      const picture = findMaterialPicture(material)
      if (!picture?.texture || material.userData?.[UNLIT_PICTURE_MATERIAL]) return material

      let replacement = replacements.get(material)
      if (!replacement) {
        replacement = new THREE.MeshBasicMaterial({
          name: material.name,
          map: picture.texture,
          color: 0xffffff,
          side: material.side,
          fog: false,
          // toneMapped: true:海报仍不受灯光影响(unlit),但和全厅同走 AgX 曲线。
          // 直出(toneMapped:false)会让海报成为全场唯一豁免色调映射的面,
          // 饱和/高光爆掉(高亮像素占比 2.4%→5.4%),把其余表面衬得发灰发蒙。
          toneMapped: true,
        })
        replacement.userData[UNLIT_PICTURE_MATERIAL] = true
        replacements.set(material, replacement)
      }

      changed = true
      count += 1
      return replacement
    })

    if (changed) object.material = Array.isArray(object.material) ? nextMaterials : nextMaterials[0]
  })

  if (count) console.info(`[gltf] rendered ${count} picture panels with unlit materials`)
  return count
}

// 场地 1 的奖杯交付文件丢掉了几件复合模型的局部 TRS：父级原本是 100 倍，
// 底座子件用 0.01 倍抵消。转换器按联合包围盒回缩父级后，杯体只剩轮廓/碎片。
// 另一个高模 node_0001 被模糊名称匹配成广播厅的 node_0，整件被摆到了别处。
// 这里只在检测到异常缩放/新高模节点时恢复，旧场景中本来正确的奖杯不会被改动。
function repairSite1TrophyWall(scene) {
  let fixed = 0
  const setTransform = (object, position, quaternion, scale) => {
    if (!object) return
    object.position.fromArray(position)
    object.quaternion.fromArray(quaternion)
    object.scale.fromArray(scale)
    object.updateMatrix()
  }

  const jiangBei14 = scene.getObjectByName('JiangBei_14')
  if (jiangBei14 && Math.max(...jiangBei14.scale.toArray().map(Math.abs)) < 10) {
    setTransform(
      jiangBei14,
      [1.841437816619873, 0.8645029664039612, -17.446176528930664],
      [0.5, 0.5, -0.5, 0.5],
      [100, 100, 100],
    )
    setTransform(
      jiangBei14.getObjectByName('Box003'),
      [-0.0007024109363555908, 0, -0.0007011890411376953],
      [0, 0, 0.7071068286895752, 0.7071067094802856],
      [0.009999998845160007, 0.009999998845160007, 0.009999999776482582],
    )
    setTransform(
      jiangBei14.getObjectByName('Cylinder002'),
      [0.0015654116868972778, 0, -0.005652093328535557],
      [0, 0, 0.7071068286895752, 0.7071067094802856],
      [0.009999998845160007, 0.009999998845160007, 0.009999999776482582],
    )
    fixed += 1
  }

  const jiangBei5 = scene.getObjectByName('JiangBei_5')
  if (jiangBei5 && Math.max(...jiangBei5.scale.toArray().map(Math.abs)) < 10) {
    setTransform(
      jiangBei5,
      [-2.192106246948242, 3.390345335006714, -17.43168067932129],
      [0.5, -0.5, 0.5, 0.5],
      [100, 100, 100],
    )
    setTransform(
      jiangBei5.getObjectByName('Box001'),
      [0.0011799037456512451, 0.0000027455389499664307, -0.003952350467443466],
      [0, 0, 0.7071068286895752, 0.7071067094802856],
      [0.010000000707805157, 0.010000000707805157, 0.009999999776482582],
    )
    setTransform(
      jiangBei5.getObjectByName('Cylinder001'),
      [0.0003362596035003662, 0, -0.008067380636930466],
      [0, 0, 0.7071068286895752, 0.7071067094802856],
      [0.010000000707805157, 0.010000000707805157, 0.009999999776482582],
    )
    fixed += 1
  }

  const jiangBei6 = scene.getObjectByName('JiangBei_6')
  if (jiangBei6 && Math.max(...jiangBei6.scale.toArray().map(Math.abs)) < 10) {
    setTransform(
      jiangBei6,
      [2.964223861694336, 2.2055492401123047, -17.42011833190918],
      [0.5, 0.5, -0.5, 0.5],
      [100, 100, 100],
    )
    fixed += 1
  }

  const deliveredHighPoly = scene.getObjectByName('node_0001')
  if (deliveredHighPoly?.isMesh) {
    const geometry = deliveredHighPoly.geometry
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const localSize = geometry.boundingBox?.getSize(new THREE.Vector3())
    if (localSize && localSize.x > 0 && localSize.y > 0 && localSize.z > 0) {
      // 新高模是 Z-up；转成展厅的 Y-up 后，精确贴回旧奖杯 1 的陈列格。
      deliveredHighPoly.position.set(0, 0, 0)
      deliveredHighPoly.rotation.set(Math.PI / 2, 0, 0)
      deliveredHighPoly.scale.set(0.59 / localSize.x, 0.34 / localSize.y, 0.98 / localSize.z)
      deliveredHighPoly.updateMatrixWorld(true)

      const box = new THREE.Box3().setFromObject(deliveredHighPoly)
      const center = box.getCenter(new THREE.Vector3())
      deliveredHighPoly.position.set(2.965 - center.x, 3.4 - box.min.y, -17.42 - center.z)
      deliveredHighPoly.updateMatrixWorld(true)

      const materials = Array.isArray(deliveredHighPoly.material)
        ? deliveredHighPoly.material
        : [deliveredHighPoly.material]
      for (const material of materials) {
        if (material?.map) material.map.name = '奖杯1_basecolor'
      }
      fixed += 1
    }
  }

  if (fixed) console.info(`[gltf] repaired ${fixed} malformed trophy-wall model(s)`)
  return fixed
}

// 单个网格的三角形总数（多材质分组时索引为准）
function suppressTrophyEnvReflection(scene) {
  let count = 0

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]

    for (const material of materials) {
      if (!material) continue
      const label = `${object.name} ${material.name} ${material.map?.name ?? ''}`
      if (!/JiangBei|奖杯|trophy/i.test(label) || material.envMapIntensity === 0) continue

      material.envMapIntensity = 0
      if (material.transparent) {
        material.roughness = Math.max(material.roughness ?? 0, 0.55)
      }
      material.needsUpdate = true
      count += 1
    }
  })

  if (count) console.info(`[lighting] disabled environment reflections on ${count} trophy materials`)
}

function isScreenVideoMaterial(material) {
  const name = typeof material?.name === 'string' ? material.name.trim() : ''
  const baseName = name.replace(/#\d+$/, '')
  return baseName === CONFIG.screenVideo.material
}

function scoreScreenVideoCandidate(size, center) {
  const width = Math.max(size.x, size.z)
  const height = size.y
  const thickness = Math.min(size.x, size.z)
  if (width < 2 || height < 1.2) return -Infinity

  const area = width * height
  const entranceBias = center.z > 0 ? 8 : 0
  const centerBias = Math.max(0, 4 - Math.abs(center.x)) * 0.5
  const thinBias = thickness < 0.35 ? 2 : 0
  return area + height * 3 + entranceBias + centerBias + thinBias
}

function findScreenVideoTarget(scene) {
  const candidates = []

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material, materialIndex) => {
      if (!isScreenVideoMaterial(material)) return

      const box = new THREE.Box3().setFromObject(object)
      if (box.isEmpty()) return

      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const score = scoreScreenVideoCandidate(size, center)
      if (!Number.isFinite(score)) return

      candidates.push({ mesh: object, material, materialIndex, center, size, score })
    })
  })

  return candidates.sort((a, b) => b.score - a.score)[0] ?? null
}

function isShadowSurface(material) {
  if (!material || material.visible === false) return false
  if (material.transparent && (material.opacity ?? 1) < 0.96) return false
  if (material.emissiveMap || material.emissive?.getMaxComponent?.() > 0.25) return false
  return true
}

function enableSceneShadows(scene) {
  let casters = 0
  let receivers = 0

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const receivesShadow = materials.some(isShadowSurface)
    const castsShadow = receivesShadow && !object.userData?.noShadow

    object.castShadow = castsShadow
    object.receiveShadow = receivesShadow

    if (castsShadow) casters += 1
    if (receivesShadow) receivers += 1
  })

  console.info(`[lighting] GLTF shadow surfaces: ${casters} casters, ${receivers} receivers`)
}

function countMeshTriangles(mesh) {
  const geometries = Array.isArray(mesh.geometry) ? mesh.geometry : [mesh.geometry]
  return geometries.reduce((total, geometry) => {
    if (!geometry) return total
    if (geometry.index) return total + geometry.index.count / 3
    return total + (geometry.attributes?.position?.count || 0) / 3
  }, 0)
}

// 高密度网格（如 tripo 生成的展品实物，单个几万面）不适合直接进碰撞 Octree：
// 全量 2.8M 三角形的八叉树会吃掉 1-2GB 内存并卡死解析阶段。
// 这类网格改用世界包围盒的 12 三角代理做碰撞，建筑墙体/展板仍走精确三角。
function listObjectMaterials(object) {
  if (!object?.material) return []
  return Array.isArray(object.material) ? object.material : [object.material]
}

function isExhibitTextureMaterial(material) {
  const mapName = typeof material?.map?.name === 'string' ? material.map.name : ''
  const match = mapName.match(/^(.+)_basecolor$/i)
  if (!match) return false

  const name = match[1].trim()
  return Boolean(name && !EXHIBIT_EXCLUDES.has(name) && CLICKABLE_EXHIBITS.has(name))
}

function shouldSkipPlayerCollision(object, size = null) {
  const materials = listObjectMaterials(object)
  if (materials.some(isExhibitTextureMaterial)) return true

  const objectName = typeof object?.name === 'string' ? object.name : ''
  const meshKey = MESH_NAME_TO_EXHIBIT[objectName]
  if (meshKey && CLICKABLE_EXHIBITS.has(meshKey)) return true

  if (/^(tripo_node_|mesh_rep_0_ori_repair_quad)/.test(objectName)) return true
  if (materials.some((material) => /^tripo_mat_/.test(material?.name ?? ''))) return true
  if (
    materials.some((material) => {
      const name = typeof material?.name === 'string' ? material.name : ''
      return name.includes('玻璃') || (material?.transparent === true && (material.opacity ?? 1) <= 0.65)
    })
  ) {
    return true
  }

  if (size) {
    const maxSpan = Math.max(size.x, size.y, size.z)
    const horizontalSpan = Math.max(size.x, size.z)
    if (maxSpan < 1.2 || (horizontalSpan < 1.6 && size.y < 1.4)) return true
  }

  return false
}

const DENSE_TRIANGLE_LIMIT = 2000
// 精确三角总量预算：实测 three Octree 入树 ~8K 三角≈1.6s，40K 约 10s 内可完成；
// 超预算的网格退化为包围盒代理（分格小盒），不再依赖场景级一刀切禁用
const COLLISION_TRIANGLE_BUDGET = 60000
const COLLISION_SCENE_TRIANGLE_LIMIT = 5000000
const TOPOLOGY_SENSITIVE_TRIANGLE_LIMIT = 800
const TOPOLOGY_SENSITIVE_MIN_SPAN = 4

function countSceneTriangles(scene) {
  let total = 0
  scene.traverse((object) => {
    if (object.isMesh && !shouldSkipPlayerCollision(object)) total += countMeshTriangles(object)
  })
  return total
}

function requiresPreciseCollision(triangleCount, size) {
  const largestSpan = Math.max(size.x, size.y, size.z)
  return (
    triangleCount <= TOPOLOGY_SENSITIVE_TRIANGLE_LIMIT &&
    largestSpan >= TOPOLOGY_SENSITIVE_MIN_SPAN
  )
}

// 碰撞体策略：
// - Octree 默认 maxLevel=16，遇共面巨型三角形会病态细分（4^16 节点潜力）导致卡死/爆内存。
//   限到 5 层（碰撞粒度 ~1.5m，足够玩家胶囊），建筑网格（外壳/地面/带门洞墙体）全部
//   保留原始三角精确碰撞——盒子化外壳会把空心建筑填实、封死门洞（实测教训）。
// - 只有超过单网格面数上限或总预算的高模（tripo 展品等小实物）用分格包围盒代理。
const COLLISION_MAX_LEVEL = 5
const PROXY_CELL_SIZE = 2
const PROXY_MAX_CELLS = 512

function buildCollisionWorld(scene) {
  // Keep high-poly exports interactive: their collider generation can take
  // minutes even when the compressed .glb itself is small.
  if (countSceneTriangles(scene) > COLLISION_SCENE_TRIANGLE_LIMIT) return null

  console.info('[perf] collision 开始')
  const startedAt = performance.now()
  const octree = new Octree()
  octree.maxLevel = COLLISION_MAX_LEVEL
  const proxies = []
  const pendingPrecise = []
  let preciseTriangleCount = 0
  let meshCount = 0
  let skippedMeshCount = 0

  scene.traverse((object) => {
    if (!object.isMesh) return
    meshCount += 1
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    if (shouldSkipPlayerCollision(object, size)) {
      skippedMeshCount += 1
      return
    }
    const triangleCount = countMeshTriangles(object)

    // Large, low-poly room meshes can include actual door openings. Bounding
    // boxes would fill those openings, so keep their triangle topology.
    const usePreciseCollision =
      triangleCount <= DENSE_TRIANGLE_LIMIT &&
      (requiresPreciseCollision(triangleCount, size) ||
        preciseTriangleCount + triangleCount <= COLLISION_TRIANGLE_BUDGET)

    if (!usePreciseCollision) {
      // 高模（小实物）用分格包围盒代理；格子限制数量防爆
      const dims = [size.x, size.y, size.z].map((value) => Math.max(value, 0.04))
      let cells = dims.map((value) => Math.max(1, Math.ceil(value / PROXY_CELL_SIZE)))
      const cellTotal = cells[0] * cells[1] * cells[2]
      if (cellTotal > PROXY_MAX_CELLS) {
        const scale = Math.cbrt(cellTotal / PROXY_MAX_CELLS)
        cells = cells.map((value) => Math.max(1, Math.ceil(value / scale)))
      }
      for (let cx = 0; cx < cells[0]; cx += 1) {
        for (let cy = 0; cy < cells[1]; cy += 1) {
          for (let cz = 0; cz < cells[2]; cz += 1) {
            const cellSize = [dims[0] / cells[0], dims[1] / cells[1], dims[2] / cells[2]]
            const proxy = new THREE.Mesh(
              new THREE.BoxGeometry(cellSize[0], cellSize[1], cellSize[2]),
            )
            proxy.position.set(
              box.min.x + cellSize[0] * (cx + 0.5),
              box.min.y + cellSize[1] * (cy + 0.5),
              box.min.z + cellSize[2] * (cz + 0.5),
            )
            proxy.updateMatrix()
            proxy.matrixWorld.copy(proxy.matrix)
            proxies.push(proxy)
          }
        }
      }
      return
    }

    preciseTriangleCount += triangleCount
    pendingPrecise.push(object)
  })
  console.info(
    `[perf] collision 网格分类完成 meshes=${meshCount} 精确三角=${preciseTriangleCount} 代理盒=${proxies.length} 耗时=${(performance.now() - startedAt).toFixed(0)}ms`,
  )
  for (const object of pendingPrecise) octree.fromGraphNode(object)
  console.info(
    `[perf] collision 精确网格入树完成 耗时=${(performance.now() - startedAt).toFixed(0)}ms`,
  )
  for (const proxy of proxies) {
    octree.fromGraphNode(proxy)
    proxy.geometry.dispose()
  }
  console.info(`[perf] collision 完成 耗时=${(performance.now() - startedAt).toFixed(0)}ms`)
  return octree
}

function buildFallbackWorldLayout(scene) {
  const box = new THREE.Box3().setFromObject(scene)
  if (box.isEmpty()) return null

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  return {
    centerX: center.x,
    centerZ: center.z,
    halfWidth: Math.max(size.x / 2, CONFIG.hall.width / 2),
    halfDepth: Math.max(size.z / 2, CONFIG.hall.depth / 2),
    transform: null,
    halls: [],
  }
}

function getSceneLayout(scene) {
  const cached = sceneLayoutCache.get(scene)
  if (cached) return cached

  console.info('[perf] layout 开始')
  scene.updateMatrixWorld(true)
  const worldLayout = buildWorldLayout(scene) ?? buildFallbackWorldLayout(scene)
  console.info('[perf] worldLayout 完成', worldLayout ? worldLayout.halls?.length + '厅' : 'null')
  const anchors = buildSceneAnchors(scene)
  console.info('[perf] anchors 完成')
  const layout = worldLayout ? { ...worldLayout, anchors } : null
  sceneLayoutCache.set(scene, layout)
  return layout
}

// 命中面材质（多材质网格按命中面的 materialIndex 取）
function getHitMaterial(hit) {
  const object = hit?.object
  if (!object?.material) return null
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  const index = hit.face?.materialIndex
  return Number.isInteger(index) && materials[index] ? materials[index] : materials[0]
}

// 展柜玻璃允许点击穿透：玻璃命中不作为最近命中参与判定
function isGlassHit(hit) {
  const material = getHitMaterial(hit)
  if (!material) return false
  const name = typeof material.name === 'string' ? material.name : ''
  if (name.includes('玻璃')) return true
  return material.transparent === true && (material.opacity ?? 1) <= 0.6
}

// 展柜实物展品识别（两条路径）：
// 1. 材质 map 命名为「中文名_basecolor」（如 手摇式录音机_basecolor），书本等排除项不参与；
// 2. 无命名贴图的实物（照片扫描件/留声机组等）按 mesh 名反查 MESH_NAME_TO_EXHIBIT。
// 两条路径都要求在 CLICKABLE_EXHIBITS 白名单内。
function findHitExhibit(hit) {
  const material = getHitMaterial(hit)
  const mapName = typeof material?.map?.name === 'string' ? material.map.name : ''
  const match = mapName.match(/^(.+)_basecolor$/i)
  if (match) {
    const name = match[1].trim()
    if (/[一-鿿]/.test(name) && !EXHIBIT_EXCLUDES.has(name) && CLICKABLE_EXHIBITS.has(name)) {
      return { name, mapName }
    }
  }

  const meshKey = MESH_NAME_TO_EXHIBIT[hit?.object?.name]
  if (meshKey && CLICKABLE_EXHIBITS.has(meshKey)) {
    return { name: meshKey, mapName: null, meshNames: getExhibitInfo(meshKey).meshNames }
  }

  return null
}

// 展品 3D 预览：把命中展品的网格克隆到独立组（几何/贴图与主场景共享，不额外占显存），
// 匹配条件 = 贴图名相同 或 mesh 名在展品登记的 meshNames 里（组类展品同组一起展示），
// 按世界包围盒居中并归一化尺寸，供弹窗内独立 Canvas 旋转查看。
const _previewBox = new THREE.Box3()
const _previewCenter = new THREE.Vector3()
const _previewSize = new THREE.Vector3()
const _decomposePosition = new THREE.Vector3()
const _decomposeQuaternion = new THREE.Quaternion()
const _decomposeScale = new THREE.Vector3()

function buildExhibitPreview(scene, exhibit) {
  const mapName = exhibit.mapName
  const meshNames = exhibit.meshNames ? new Set(exhibit.meshNames) : null
  const group = new THREE.Group()

  scene.traverse((object) => {
    if (!object.isMesh || object === scene) return
    if (meshNames) {
      if (!meshNames.has(object.name)) return
    } else {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      if (!materials.some((material) => material?.map?.name === mapName)) return
    }

    const clone = object.clone()
    object.updateWorldMatrix(true, false)
    object.matrixWorld.decompose(_decomposePosition, _decomposeQuaternion, _decomposeScale)
    clone.position.copy(_decomposePosition)
    clone.quaternion.copy(_decomposeQuaternion)
    clone.scale.copy(_decomposeScale)
    group.add(clone)
  })

  if (!group.children.length) return null

  _previewBox.setFromObject(group)
  if (_previewBox.isEmpty()) return null
  _previewBox.getCenter(_previewCenter)
  _previewBox.getSize(_previewSize)

  const maxSpan = Math.max(_previewSize.x, _previewSize.y, _previewSize.z) || 1
  const scale = 1.5 / maxSpan
  const wrapper = new THREE.Group()
  wrapper.scale.setScalar(scale)
  wrapper.position.copy(_previewCenter).multiplyScalar(-scale)
  wrapper.add(group)
  return wrapper
}

// 从 R3F 事件的全部命中里取「最近且非玻璃」的命中（展柜玻璃允许点击/悬停穿透）
function nearestNonGlassHit(event) {
  return (event.intersections ?? []).filter((hit) => !isGlassHit(hit))[0] ?? null
}

// 解析命中面上的可交互目标：进门大屏 → { kind: 'screen' }；展柜实物 → { kind: 'exhibit' }；
// 墙上照片 → { kind: 'picture' }
function resolveHitTarget(nearest, screenMesh) {
  if (!nearest) return null

  // 进门大屏：命中视频屏网格 → 点击播放/暂停（按网格身份判定，最确定）
  if (screenMesh && nearest.object === screenMesh) return { kind: 'screen' }

  // 展柜实物展品优先：命名贴图判定是确定性的，且展品贴图不应再走图片流程
  const exhibit = findHitExhibit(nearest)
  if (exhibit) return { kind: 'exhibit', exhibit }

  const picture = findPictureTexture(nearest.object, nearest.face)
  if (picture?.texture) return { kind: 'picture', picture, uv: nearest.uv }
  return null
}

// 从 R3F 事件的全部命中里取「最近且非玻璃」的命中并解析可交互目标。
// 点击与悬停提示共用，保证出现提示的目标一定可点。
function resolveSceneTarget(event, screenMesh) {
  const nearest = nearestNonGlassHit(event)
  if (!nearest || nearest.object !== event.object) return null
  return resolveHitTarget(nearest, screenMesh)
}

function getPictureCenter(nearest, camera) {
  const object = nearest?.object
  const geometry = object?.geometry
  if (!geometry) return { point: nearest.point.clone(), corners: [] }

  geometry.computeBoundingBox()
  if (!geometry.boundingBox) return { point: nearest.point.clone(), corners: [] }

  object.updateWorldMatrix(true, false)
  const point = geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(object.matrixWorld)
  const localSize = geometry.boundingBox.getSize(new THREE.Vector3())
  const worldScale = object.getWorldScale(new THREE.Vector3())
  const spans = [localSize.x * worldScale.x, localSize.y * worldScale.y, localSize.z * worldScale.z].sort(
    (a, b) => a - b,
  )
  const normal = nearest.face?.normal?.clone().transformDirection(object.matrixWorld).normalize()
  const surfaceOffset = Math.max(0.003, Math.min(spans[0] * 0.55 + 0.002, 0.15))
  if (normal && camera) {
    if (normal.dot(camera.position.clone().sub(point)) < 0) normal.negate()
    point.addScaledVector(normal, surfaceOffset)
  }

  const corners = []
  for (const x of [geometry.boundingBox.min.x, geometry.boundingBox.max.x]) {
    for (const y of [geometry.boundingBox.min.y, geometry.boundingBox.max.y]) {
      for (const z of [geometry.boundingBox.min.z, geometry.boundingBox.max.z]) {
        const corner = new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld)
        if (normal) corner.addScaledVector(normal, surfaceOffset)
        corners.push(corner)
      }
    }
  }

  return {
    point,
    corners,
  }
}

function PictureHoverHint({ point, corners, occlusionRef }) {
  const contentRef = useRef(null)
  const { camera, size } = useThree()
  const projectedPointRef = useRef(new THREE.Vector3())

  useFrame(() => {
    const content = contentRef.current
    if (!content || !corners.length) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const corner of corners) {
      const projected = projectedPointRef.current.copy(corner).project(camera)
      minX = Math.min(minX, (projected.x + 1) * size.width * 0.5)
      maxX = Math.max(maxX, (projected.x + 1) * size.width * 0.5)
      minY = Math.min(minY, (1 - projected.y) * size.height * 0.5)
      maxY = Math.max(maxY, (1 - projected.y) * size.height * 0.5)
    }

    const scale = Math.min(((maxX - minX) * 0.6) / 165, ((maxY - minY) * 0.6) / 113, 1)
    content.style.transform = `scale(${Math.max(scale, 0).toFixed(3)})`
    content.style.opacity = scale >= 0.16 ? '1' : '0'
  })

  return (
    <Html position={point} center occlude={[occlusionRef]} style={{ pointerEvents: 'none' }}>
      <div
        ref={contentRef}
        className="flex flex-col items-center"
        style={{ opacity: 0, transform: 'scale(0)', transformOrigin: 'center' }}
      >
        <img src="/ui/viewmore.png" alt="" style={{ width: 71, height: 71 }} />
        <div
          className="flex items-center justify-center"
          style={{
            width: 165,
            height: 44,
            marginTop: -2,
            backgroundImage: 'url(/ui/viewmore-box.png)',
            backgroundSize: '100% 100%',
          }}
        >
          <span className="text-[18px] leading-none text-white">点击查看大图</span>
        </div>
      </div>
    </Html>
  )
}

// 大屏底部进度条：可拖拽跳转。可见细条不参与射线，命中由加高的隐形热区承担；
// 拖动期间在窗口层面跟踪指针，把射线与进度条所在平面的交点映射为播放进度。
// barInteractRef：记录最近一次条带交互时间，GltfModel 据此丢弃紧随其后
// 合成出的面板点击（否则点一下进度条会同时触发播放/暂停切换）。
function ScreenProgressBar({ bar, videoRef, barInteractRef }) {
  const { camera, gl } = useThree()
  const fillRef = useRef(null)
  const draggingRef = useRef(false)

  const ratioFromX = (x) =>
    THREE.MathUtils.clamp((x - (bar.x - bar.width / 2)) / bar.width, 0, 1)

  const seek = (ratio) => {
    const video = videoRef.current
    if (video?.duration) video.currentTime = ratio * video.duration
    if (typeof window !== 'undefined') {
      window.__screenProgressDebug = {
        ratio,
        currentTime: video?.currentTime ?? null,
        duration: video?.duration ?? null,
      }
    }
  }

  const seekFromWorldX = (x) => {
    const ratio = ratioFromX(x)
    seek(ratio)
    return ratio
  }

  const handlePointerDown = (event) => {
    // 阻止其后分发到面板的点击（播放/暂停），并阻断 Player 的拖拽转视角
    event.stopPropagation()
    event.nativeEvent?.stopImmediatePropagation?.()
    if (barInteractRef) barInteractRef.current = performance.now()
    draggingRef.current = true
    seekFromWorldX(event.point.x)
    try {
      const pointerId = event.pointerId ?? event.nativeEvent?.pointerId
      if (Number.isFinite(pointerId)) gl.domElement.setPointerCapture?.(pointerId)
    } catch {
      // Pointer capture is only a drag robustness hint; window-level move handlers are the fallback.
    }
  }

  const handlePointerMove = (event) => {
    if (!draggingRef.current) return
    event.stopPropagation()
    seekFromWorldX(event.point.x)
  }

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -bar.z)
    const hit = new THREE.Vector3()

    const ratioFromClientPoint = (event) => {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(plane, hit)) return null

      const insideX = hit.x >= bar.x - bar.width / 2 && hit.x <= bar.x + bar.width / 2
      const insideY = Math.abs(hit.y - bar.y) <= 0.18
      if (!insideX || !insideY) return null

      return ratioFromX(hit.x)
    }

    const onDown = (event) => {
      const ratio = ratioFromClientPoint(event)
      if (ratio === null) return
      event.preventDefault()
      event.stopPropagation()
      if (barInteractRef) barInteractRef.current = performance.now()
      draggingRef.current = true
      seek(ratio)
    }

    const onMove = (event) => {
      if (!draggingRef.current) return
      const ratio = ratioFromClientPoint(event)
      if (ratio !== null) seek(ratio)
    }
    const onUp = () => {
      draggingRef.current = false
    }

    gl.domElement.addEventListener('pointerdown', onDown, true)
    gl.domElement.addEventListener('mousedown', onDown, true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      gl.domElement.removeEventListener('pointerdown', onDown, true)
      gl.domElement.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [bar, camera, gl])

  // 按播放进度推进填充条（左端对齐）
  useFrame(() => {
    const video = videoRef.current
    const fill = fillRef.current
    if (!video || !fill || !video.duration) return
    const ratio = THREE.MathUtils.clamp(video.currentTime / video.duration, 0, 1)
    fill.scale.x = Math.max(ratio, 0.001)
    fill.position.x = bar.x - bar.width / 2 + (bar.width * ratio) / 2
  })

  return (
    <group>
      <mesh name="screen-progress-rail" position={[bar.x, bar.y, bar.z]} raycast={() => {}}>
        <planeGeometry args={[bar.width, 0.05]} />
        <meshBasicMaterial
          color="#0f172a"
          transparent
          opacity={0.5}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh name="screen-progress-fill" ref={fillRef} position={[bar.x, bar.y, bar.z]} raycast={() => {}}>
        <planeGeometry args={[bar.width, 0.05]} />
        <meshBasicMaterial
          color="#f0e6cc"
          transparent
          opacity={0.95}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 加高的隐形拖拽热区（不渲染，只承担命中与拖拽） */}
      <mesh
        name="screen-progress-hotspot"
        position={[bar.x, bar.y, bar.z]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => {
          draggingRef.current = false
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'ew-resize'
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'pointer' // 热区贴着屏面，移出即回到「可点击大屏」光标
        }}
      >
        <planeGeometry args={[bar.width, 0.26]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

export function GltfModel({
  url,
  collisionWorldRef,
  onWorldLayout,
  onSelectPicture,
  onSelectExhibit,
  hoverEnabled = true,
  onHoverHint,
}) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const sceneRoot = useThree((state) => state.scene)
  const occlusionRef = useRef(sceneRoot)
  occlusionRef.current = sceneRoot
  // KTX2（GPU 压缩纹理）支持：basis 转码器放 public/basis/，按当前渲染器能力选择转码目标。
  // 注意：桌面 ANGLE 上 BC7(bptc)/模拟 ETC2/ASTC 在部分驱动上会把 sRGB 压缩贴图
  // 采样成黑色或随视角闪烁（undefined behavior）；S3TC(BC1/BC3) 是 D3D 原生格式，
  // 只要支持就强制只走 S3TC，规避整类驱动兼容问题。
  const ktx2Loader = useMemo(() => {
    const loader = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl)
    const caps = loader.workerConfig
    if (caps && caps.dxtSupported) {
      caps.bptcSupported = false
      caps.astcSupported = false
      caps.etc1Supported = false
      caps.etc2Supported = false
      caps.pvrtcSupported = false
      if (!ktx2TargetLogged) {
        ktx2TargetLogged = true
        console.info('[gltf] KTX2 转码目标锁定为 S3TC(BC1/BC3)，规避 BC7/ETC2/ASTC 驱动兼容问题')
      }
    } else if (!ktx2TargetLogged) {
      ktx2TargetLogged = true
      console.info('[gltf] KTX2 转码目标:', JSON.stringify(caps))
    }
    return loader
  }, [gl])
  // 第三个参数启用 MeshoptDecoder：新模型的几何带 EXT_meshopt_compression
  const { scene } = useGLTF(url, false, true, (loader) => {
    loader.setKTX2Loader(ktx2Loader)
  })
  const worldLayout = useMemo(() => {
    removeOccludingBlankPanels(scene) // 必须先于布局/碰撞体构建
    repairSite1TrophyWall(scene) // 必须先于布局/碰撞体与奖杯材质处理
    removeTechHallTransparentBlockers(scene)
    fixShowcaseGlassMaterials(scene)
    brightenShowcaseDisplayMaterials(scene)
    fixTechDeviceLostMaterials(scene)
    makePicturePanelsUnlit(scene)
    suppressEnvReflectionOnEmissivePanels(scene)
    suppressTrophyEnvReflection(scene)
    enableSceneShadows(scene)
    if (typeof window !== 'undefined') window.__gltfScene = scene // 调试用：自动化测试检查场景网格
    return getSceneLayout(scene)
  }, [scene])

  // 贴图各向异性过滤：墙面海报/地砖在斜视角下高频纹理会随移动闪烁（mipmap 走样），
  // 8x anisotropy 显著缓解；在首次上传前设置（本 useMemo 早于首帧渲染执行）。
  useMemo(() => {
    const maxAnisotropy = gl.capabilities?.getMaxAnisotropy?.() ?? 1
    const anisotropy = Math.min(8, maxAnisotropy)
    if (anisotropy <= 1) return
    const touched = new Set()
    scene.traverse((object) => {
      if (!object.isMesh) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!material) continue
        for (const texture of [
          material.map,
          material.emissiveMap,
          material.normalMap,
          material.aoMap,
          material.roughnessMap,
          material.metalnessMap,
        ]) {
          if (texture && !touched.has(texture.uuid)) {
            touched.add(texture.uuid)
            texture.anisotropy = anisotropy
          }
        }
      }
    })
  }, [gl, scene])
  // 立式屏静态图高清替换:压缩管线把全场景贴图统一限到 1536 边长,但 3屏 源图是
  // 4K(3840×2160)、4屏 1696×712,运行时换回 public/models/panel-hires/ 的高清版;
  // 2屏 源图本身只有 751×459(散图与模型内一致,无更高清来源),用 2 倍 lanczos
  // 超分 + 轻锐化补偿。只换贴图、不动材质,亮度观感与现状一致(旧 KTX2 贴图
  // 不 dispose:useGLTF 场景缓存被 HMR 复用时不至于引用已释放纹理)。
  useEffect(() => {
    // 无防重入守卫:React StrictMode 开发期双挂载时,首次的异步加载会被本 effect
    // 的 cleanup 置废,重挂载必须重新发起才能最终挂上(重复加载同一 URL 无副作用)
    let disposed = false
    const maxAnisotropy = gl.capabilities?.getMaxAnisotropy?.() ?? 1
    const loader = new THREE.TextureLoader()
    const pending = new Map()

    scene.traverse((object) => {
      if (!object.isMesh) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!material) continue
        for (const slot of ['map', 'emissiveMap']) {
          const original = material[slot]
          const url = PANEL_HIRES_TEXTURES[original?.name]
          if (!url) continue
          let load = pending.get(url)
          if (!load) {
            load = loader.loadAsync(url).then((texture) => {
              // 对齐原贴图的采样参数(glTF 翻转/平铺/UV 变换),否则画面会上下颠倒
              texture.colorSpace = THREE.SRGBColorSpace
              texture.flipY = original.flipY
              texture.wrapS = original.wrapS
              texture.wrapT = original.wrapT
              texture.repeat.copy(original.repeat)
              texture.offset.copy(original.offset)
              texture.rotation = original.rotation
              texture.anisotropy = Math.min(8, maxAnisotropy)
              texture.name = original.name
              texture.needsUpdate = true
              return texture
            })
            pending.set(url, load)
          }
          load
            .then((texture) => {
              if (disposed) return
              material[slot] = texture
            })
            .catch((error) => console.warn('[gltf] 高清屏贴图加载失败', url, error))
        }
      }
    })

    return () => {
      disposed = true
    }
  }, [gl, scene])

  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    onWorldLayout?.(worldLayout)
  }, [onWorldLayout, worldLayout])

  useEffect(() => {
    console.info('[perf] collision effect 触发, ref=', !!collisionWorldRef)
    if (!collisionWorldRef) return undefined

    collisionWorldRef.current = null
    let disposed = false
    const timer = window.setTimeout(() => {
      console.info('[perf] collision 定时器回调, disposed=', disposed)
      if (disposed) return
      const collisionWorld = buildCollisionWorld(scene)
      if (!disposed) collisionWorldRef.current = collisionWorld
    }, 0)

    return () => {
      disposed = true
      window.clearTimeout(timer)
      collisionWorldRef.current = null
    }
  }, [collisionWorldRef, scene])

  // ---- 进门大屏视频：进场静音自动播放（首次任意点击恢复声音），点击播放/暂停，
  // 进度条可拖拽跳转，音量随人物距离衰减 ----
  // 定位「1屏」网格并把视频贴图换上屏；useGLTF 缓存场景，卸载时须还原材质
  const screenRef = useRef(null) // { mesh, material, center }
  const screenVideoRef = useRef(null)
  const barInteractRef = useRef(0) // 最近一次进度条交互时间（丢弃其后 0.8s 内合成的面板点击）
  const [screenBar, setScreenBar] = useState(null)
  const [screenVideoPlane, setScreenVideoPlane] = useState(null)

  useEffect(() => {
    let disposed = false

    screenRef.current = findScreenVideoTarget(scene)
    const screen = screenRef.current
    if (!screen) {
      console.warn(`[screen-video] 未找到可用的 ${CONFIG.screenVideo.material} 大屏材质`)
      return undefined
    }

    const { material } = screen
    const originalMeshMaterial = screen.mesh.material

    const video = document.createElement('video')
    video.src = CONFIG.screenVideo.url
    video.loop = true
    video.playsInline = true
    video.preload = 'auto'
    // 浏览器禁止带声自动播放：先静音自动播放，首次任意点击恢复声音（与背景音乐同套路）
    video.muted = true
    video.autoplay = true
    video.setAttribute('aria-hidden', 'true')
    video.tabIndex = -1
    video.style.cssText =
      'position:fixed;left:-2px;top:-2px;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.append(video)
    screenVideoRef.current = video
    if (typeof window !== 'undefined') window.__screenVideo = video // 调试/自动化测试

    const startTime = Number(CONFIG.screenVideo.startTime) || 0
    const onMetadata = () => {
      if (!startTime || disposed) return
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      video.currentTime = duration > 1 ? Math.min(startTime, duration - 1) : startTime
    }

    let texture = null
    let videoMaterial = null
    const onReady = () => {
      if (disposed) return
      // 新场景的大屏 UV 会裁到视频红底区域；这里在屏幕前覆盖一张标准 UV 视频面片。
      texture = new THREE.VideoTexture(video)
      texture.colorSpace = THREE.SRGBColorSpace
      const videoAspect = (video.videoWidth || 16) / (video.videoHeight || 9)
      const panelAspect = screen.size.x / screen.size.y
      if (videoAspect > panelAspect) {
        const repeatX = panelAspect / videoAspect
        texture.repeat.set(repeatX, 1)
        texture.offset.set((1 - repeatX) / 2, 0)
      } else {
        const repeatY = videoAspect / panelAspect
        texture.repeat.set(1, repeatY)
        texture.offset.set(0, (1 - repeatY) / 2)
      }
      videoMaterial = new THREE.MeshBasicMaterial({
        name: `${material.name}-video-overlay`,
        map: texture,
        color: 0xffffff,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      })

      const plane = {
        x: screen.center.x,
        y: screen.center.y,
        z: screen.center.z + screen.size.z / 2 + 0.018,
        width: screen.size.x,
        height: screen.size.y,
        material: videoMaterial,
      }
      setScreenVideoPlane(plane)

      // 进度条几何参数（JSX 组件按世界坐标摆放）。
      // 距屏面 8cm：太贴近（1-2cm）时点击射线在热区与面板间的浮点误差内
      // 翻转命中顺序，拖拽会被面板点击（播放/暂停）抢走
      setScreenBar({
        x: screen.center.x,
        y: screen.center.y - screen.size.y / 2 + 0.22,
        z: screen.center.z + screen.size.z / 2 + 0.08,
        width: screen.size.x * 0.86,
      })
    }
    video.addEventListener('loadedmetadata', onMetadata, { once: true })
    video.addEventListener('loadeddata', onReady, { once: true })
    video.load()
    video.play().catch(() => {}) // 静音自动播放；个别环境被策略拦截时等首次点击

    // 诊断：自动暂停时在控制台打出触发来源（区分 代码调用 / 浏览器策略）
    const origPause = video.pause.bind(video)
    let codePaused = false
    video.pause = () => {
      codePaused = true
      console.warn(
        '[screen-video] 代码暂停 @',
        video.currentTime.toFixed(1),
        's',
        new Error().stack?.split('\n').slice(2, 5).join(' <- '),
      )
      return origPause()
    }
    video.addEventListener('pause', () => {
      if (codePaused) {
        codePaused = false
        return
      }
      console.warn('[screen-video] 浏览器触发暂停 @', video.currentTime.toFixed(1), 's')
    })
    video.addEventListener('error', () => console.warn('[screen-video] 媒体错误', video.error?.code))

    // 首次任意点击恢复声音（点击大屏的 toggleScreenVideo 也会开声），一次即卸载
    const unmute = () => {
      video.muted = false
      window.removeEventListener('pointerdown', unmute)
    }
    window.addEventListener('pointerdown', unmute)

    return () => {
      disposed = true
      window.removeEventListener('pointerdown', unmute)
      video.pause()
      video.removeAttribute('src')
      video.load() // 释放解码资源
      video.remove()
      screen.mesh.material = originalMeshMaterial
      texture?.dispose()
      videoMaterial?.dispose()
      setScreenBar(null)
      setScreenVideoPlane(null)
      screenVideoRef.current = null
      screenRef.current = null
      if (typeof window !== 'undefined') window.__screenVideo = null
    }
  }, [scene])

  const toggleScreenVideo = () => {
    const video = screenVideoRef.current
    if (!video) return
    if (video.paused) {
      video.muted = false // 点击手势内开声，规避自动播放策略
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  // 走近声音越大、离远越小：满音量距离内线性衰减，静音距离外为 0
  // （进度条刷新在 ScreenProgressBar 自己的 useFrame 里）
  useFrame(({ camera }) => {
    const video = screenVideoRef.current
    const screen = screenRef.current
    if (!video || !screen || video.paused) return

    const loopStart = Number(CONFIG.screenVideo.startTime) || 0
    const loopEnd = Number(CONFIG.screenVideo.loopEndTime) || 0
    if (loopEnd > loopStart && video.currentTime >= loopEnd) {
      video.currentTime = loopStart
    }

    const { maxVolume, fullVolumeDistance, muteDistance } = CONFIG.screenVideo
    const distance = camera.position.distanceTo(screen.center)
    const falloff = THREE.MathUtils.clamp(
      (muteDistance - distance) / (muteDistance - fullVolumeDistance),
      0,
      1,
    )
    video.volume = falloff * maxVolume
  })

  // 点击墙上照片/展柜实物/进门大屏：
  // - 进门大屏 → 播放/暂停视频；
  // - 展柜实物（中文名_basecolor 贴图）→ 弹出 2D 展品说明（onSelectExhibit）；
  // - 墙上照片（材质.NNN 系列贴图）→ 导出原图交给可缩放查看器。
  // R3F 会沿射线对每个命中对象各派发一次事件，只处理最近命中面
  // （玻璃命中被过滤、可穿透），使墙体和展板空白区域等
  // 可见遮挡物能够阻止其后的目标被选中。
  const handleSceneClick = async (event) => {
    if (event.delta > 6) return // 拖拽旋转视角的抬起不视为点击

    const target = resolveSceneTarget(event, screenRef.current?.mesh)
    if (!target) return

    event.stopPropagation()

    if (target.kind === 'screen') {
      // 刚拖/点过进度条：pointerup 合成出的这次面板点击只当拖拽收尾，不切换播放
      if (performance.now() - barInteractRef.current < 800) return
      toggleScreenVideo()
      return
    }

    if (target.kind === 'exhibit') {
      if (mountedRef.current) {
        const object = buildExhibitPreview(scene, target.exhibit)
        onSelectExhibit?.({ name: target.exhibit.name, object })
      }
      return
    }

    try {
      const photo = await textureToPhoto(target.picture.texture, target.picture.name, {
        board: target.picture.board,
        uv: target.uv,
      })

      if (photo && mountedRef.current) onSelectPicture?.(photo)
    } catch (error) {
      console.error('导出图片贴图失败', error)
    }
  }

  // 悬停提示：与点击共用 resolveSceneTarget，保证「提示可点 = 真的能点」。
  // 光标变化时切换 body 光标（与奖杯悬停一致），坐标上报给 DOM 浮层。
  const hoverKindRef = useRef(null)
  const hoverPictureIdRef = useRef(null)
  const [hoverPicture, setHoverPictureState] = useState(null)

  const setPictureHover = (picture) => {
    if (picture?.id === hoverPictureIdRef.current) return
    hoverPictureIdRef.current = picture?.id ?? null
    setHoverPictureState(picture)
  }

  const setHoverHint = (hint) => {
    const kind = hint ? hint.kind : null
    if (kind && kind !== 'picture') {
      onHoverHint?.(hint)
    } else if (hoverKindRef.current !== null) {
      onHoverHint?.(null)
    }
    if (kind !== hoverKindRef.current) {
      hoverKindRef.current = kind
      document.body.style.cursor = kind ? 'pointer' : 'auto'
    }
  }

  const handleScenePointerMove = (event) => {
    if (!hoverEnabled) {
      setHoverHint(null)
      return
    }
    // R3F 对同一射线上每个命中各派发一次 move：只有「最近命中」的那次负责判定，
    // 其余分发直接忽略——若让它们的空结果清提示，提示会被同一次移动的后续分发误杀
    const nearest = nearestNonGlassHit(event)
    if (nearest && nearest.object !== event.object) return
    const target = resolveHitTarget(nearest, screenRef.current?.mesh)
    const targetId =
      target?.kind === 'picture' ? `${nearest.object.uuid}:${target.picture.texture.uuid}` : null
    setPictureHover(
      targetId
        ? {
            id: targetId,
            ...getPictureCenter(nearest, camera),
          }
        : null,
    )
    setHoverHint(
      target
        ? {
            kind: target.kind,
            x: event.clientX,
            y: event.clientY,
            playing: target.kind === 'screen' ? !screenVideoRef.current?.paused : undefined,
          }
        : null,
    )
  }

  // 悬停禁用（弹窗冻结/指针锁定）或卸载时清掉光标与浮层
  useEffect(() => {
    if (hoverEnabled) return undefined
    hoverKindRef.current = null
    setPictureHover(null)
    document.body.style.cursor = 'auto'
    onHoverHint?.(null)
    return undefined
  }, [hoverEnabled, onHoverHint])

  useEffect(
    () => () => {
      document.body.style.cursor = 'auto'
    },
    [],
  )

  return (
    <>
      <primitive
        object={scene}
        onClick={handleSceneClick}
        onPointerMove={handleScenePointerMove}
        onPointerOut={() => {
          setPictureHover(null)
          setHoverHint(null)
        }}
      />
      <TechHallCornerShadows scene={scene} worldLayout={worldLayout} />
      <CareHallCornerShadows scene={scene} worldLayout={worldLayout} />
      <RectHallsCornerShadows scene={scene} worldLayout={worldLayout} />
      <MainHallCornerShadows scene={scene} />
      {screenVideoPlane ? (
        <mesh
          name="screen-video-overlay"
          position={[screenVideoPlane.x, screenVideoPlane.y, screenVideoPlane.z]}
          raycast={() => {}}
        >
          <planeGeometry args={[screenVideoPlane.width, screenVideoPlane.height]} />
          <primitive object={screenVideoPlane.material} attach="material" />
        </mesh>
      ) : null}
      {hoverPicture ? (
        <PictureHoverHint
          point={hoverPicture.point}
          corners={hoverPicture.corners}
          occlusionRef={occlusionRef}
        />
      ) : null}
      {screenBar ? (
        <ScreenProgressBar bar={screenBar} videoRef={screenVideoRef} barInteractRef={barInteractRef} />
      ) : null}
    </>
  )
}
