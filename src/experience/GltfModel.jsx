import { useEffect } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { Octree } from 'three/examples/jsm/math/Octree.js'
import { CONFIG } from '../data/config.js'
import { HALLS } from '../data/halls.js'

function buildWorldLayout(scene) {
  const hallBoxes = HALLS.map((hall) => {
    const matches = []
    scene.traverse((object) => {
      if (object === scene) return
      if (typeof object.name !== 'string' || !object.name.startsWith(hall.name)) return
      matches.push(object)
    })

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
    }
  }).filter(Boolean)

  if (hallBoxes.length < 4) return null

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
    halls: hallBoxes.map((hall) => ({
      id: hall.id,
      name: hall.name,
      x: ((hall.centerX - centerX) * baseHalfWidth) / halfWidth,
      z: ((hall.centerZ - centerZ) * baseHalfDepth) / halfDepth,
      sizeX: (hall.sizeX * baseHalfWidth) / halfWidth,
      sizeZ: (hall.sizeZ * baseHalfDepth) / halfDepth,
    })),
  }
}

export function GltfModel({ url, collisionWorldRef, onWorldLayout }) {
  const { scene } = useGLTF(url)

  useEffect(() => {
    if (!collisionWorldRef) return undefined

    scene.updateMatrixWorld(true)
    const collisionWorld = new Octree().fromGraphNode(scene)
    collisionWorldRef.current = collisionWorld
    onWorldLayout?.(buildWorldLayout(scene))

    return () => {
      if (collisionWorldRef.current === collisionWorld) {
        collisionWorldRef.current = null
      }
    }
  }, [collisionWorldRef, onWorldLayout, scene])

  return <primitive object={scene} />
}
