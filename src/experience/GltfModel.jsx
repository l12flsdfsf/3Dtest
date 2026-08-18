import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { Octree } from 'three/examples/jsm/math/Octree.js'
import { CONFIG } from '../data/config.js'
import { HALLS, getHallCanonicalCenter } from '../data/halls.js'
import { findPictureTexture, textureToPhoto } from './pictureTexture.js'

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

const sceneAnalysisCache = new WeakMap()

function getSceneAnalysis(scene) {
  const cached = sceneAnalysisCache.get(scene)
  if (cached) return cached

  scene.updateMatrixWorld(true)
  const worldLayout = buildWorldLayout(scene)
  const anchors = buildSceneAnchors(scene)
  const analysis = {
    collisionWorld: new Octree().fromGraphNode(scene),
    worldLayout: worldLayout ? { ...worldLayout, anchors } : null,
  }
  sceneAnalysisCache.set(scene, analysis)
  return analysis
}

export function GltfModel({ url, collisionWorldRef, onWorldLayout, onSelectPicture }) {
  const { scene } = useGLTF(url)
  const analysis = useMemo(() => getSceneAnalysis(scene), [scene])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!collisionWorldRef) return undefined

    collisionWorldRef.current = analysis.collisionWorld
    onWorldLayout?.(analysis.worldLayout)

    return () => {
      if (collisionWorldRef.current === analysis.collisionWorld) {
        collisionWorldRef.current = null
      }
    }
  }, [analysis, collisionWorldRef, onWorldLayout])

  // 点击墙上照片/展板/屏幕：从命中网格的材质里取出图片贴图，导出原图交给查看器。
  // R3F 会沿射线对每个命中对象各派发一次事件，只处理最近命中面，
  // 使墙体和展板空白区域等可见遮挡物能够阻止其后的图片被选中。
  const handlePictureClick = async (event) => {
    if (event.delta > 6) return // 拖拽旋转视角的抬起不视为点击

    const nearest = event.intersections?.[0]
    if (!nearest || nearest.object !== event.object) return

    event.stopPropagation()

    try {
      const picture = findPictureTexture(nearest.object, nearest.face)
      if (!picture?.texture) return

      const photo = await textureToPhoto(picture.texture, picture.name, {
        board: picture.board,
        uv: nearest.uv,
      })

      if (photo && mountedRef.current) onSelectPicture?.(photo)
    } catch (error) {
      console.error('导出图片贴图失败', error)
    }
  }

  return <primitive object={scene} onClick={handlePictureClick} />
}
