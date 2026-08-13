import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { Octree } from 'three/examples/jsm/math/Octree.js'

export function GltfModel({ url, collisionWorldRef }) {
  const { scene } = useGLTF(url)

  useEffect(() => {
    if (!collisionWorldRef) return undefined

    const collisionWorld = new Octree().fromGraphNode(scene)
    collisionWorldRef.current = collisionWorld

    return () => {
      if (collisionWorldRef.current === collisionWorld) {
        collisionWorldRef.current = null
      }
    }
  }, [collisionWorldRef, scene])

  return <primitive object={scene} />
}
