import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export function SceneEnvironment() {
  const { gl, scene } = useThree()

  useEffect(() => {
    const previousEnvironment = scene.environment
    const previousEnvironmentIntensity = scene.environmentIntensity
    const pmrem = new THREE.PMREMGenerator(gl)
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04)

    scene.environment = target.texture
    // Keep metallic detail while preventing the white room probe from
    // flattening the imported materials into a grey veil.
    scene.environmentIntensity = 0.30

    return () => {
      scene.environment = previousEnvironment
      scene.environmentIntensity = previousEnvironmentIntensity
      target.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])

  return null
}
