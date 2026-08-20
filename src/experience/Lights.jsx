import { useLayoutEffect, useMemo, useRef } from 'react'
import { CONFIG } from '../data/config.js'

function AimedSpotLight({
  target,
  castShadow = false,
  shadowMapSize = [768, 768],
  shadowNear = 0.6,
  shadowFar = 12,
  shadowBias = -0.00008,
  shadowNormalBias = 0.02,
  shadowRadius = 3,
  ...props
}) {
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
      <spotLight
        ref={lightRef}
        castShadow={castShadow}
        shadow-mapSize={shadowMapSize}
        shadow-camera-near={shadowNear}
        shadow-camera-far={shadowFar}
        shadow-bias={shadowBias}
        shadow-normalBias={shadowNormalBias}
        shadow-radius={shadowRadius}
        {...props}
      />
    </>
  )
}

export function Lights() {
  const roomLights = useMemo(() => {
    const corridorHalf = CONFIG.hall.corridorHalf ?? 4
    const roomDepth = CONFIG.hall.depth / 2 - corridorHalf
    const roomCenterZ = corridorHalf + roomDepth / 2
    const roomCentersX = [-CONFIG.hall.width / 3, 0, CONFIG.hall.width / 3]
    const ceilingY = CONFIG.hall.height - 0.48

    return roomCentersX.flatMap((x) => [
      {
        key: `front-${x}`,
        position: [x, ceilingY, roomCenterZ],
        target: [x, 1.1, roomCenterZ],
        intensity: 4.6,
        distance: 7.4,
      },
      {
        key: `back-${x}`,
        position: [x, ceilingY, -roomCenterZ],
        target: [x, 1.1, -roomCenterZ],
        intensity: 4.6,
        distance: 7.4,
      },
    ])
  }, [])

  const sideLightX = CONFIG.hall.width / 2 - 0.55
  const ceilingY = CONFIG.hall.height - 0.42
  const sandTableCenterX = CONFIG.hall.sandTable?.centerX ?? -6.1
  const sandTableCenterZ = CONFIG.hall.sandTable?.centerZ ?? 0

  return (
    <>
      <hemisphereLight args={['#f7fafc', '#c8d0d8', 0.4]} />
      <ambientLight intensity={0.14} color="#f7f9fc" />

      {/* 仅保留弱化的整体补光，不再让它产生室内假阴影。 */}
      <directionalLight position={[6, 10, 4]} intensity={0.14} color="#eef3f9" />

      <AimedSpotLight
        position={[0, ceilingY, 0]}
        target={[0, 0.95, 0]}
        angle={0.68}
        penumbra={0.38}
        intensity={8.4}
        distance={12.4}
        decay={2}
        color="#fbfdff"
        castShadow
        shadowMapSize={[1024, 1024]}
        shadowFar={16}
        shadowNormalBias={0.028}
        shadowRadius={4}
      />

      <AimedSpotLight
        position={[sandTableCenterX, ceilingY - 0.12, sandTableCenterZ]}
        target={[sandTableCenterX, 1.05, sandTableCenterZ]}
        angle={0.44}
        penumbra={0.36}
        intensity={5.2}
        distance={7.8}
        decay={2}
        color="#f5f8fb"
        castShadow
        shadowMapSize={[768, 768]}
        shadowFar={10}
        shadowNormalBias={0.024}
        shadowRadius={3}
      />

      <AimedSpotLight
        position={[-sideLightX, ceilingY, 0]}
        target={[-sideLightX + 0.35, 1.55, 0]}
        angle={0.46}
        penumbra={0.34}
        intensity={3.1}
        distance={6.8}
        decay={2}
        color="#eef4fa"
      />

      <AimedSpotLight
        position={[sideLightX, ceilingY, 0]}
        target={[sideLightX - 0.35, 1.55, 0]}
        angle={0.46}
        penumbra={0.34}
        intensity={3.1}
        distance={6.8}
        decay={2}
        color="#eef4fa"
      />

      {roomLights.map((light) => (
        <AimedSpotLight
          key={light.key}
          position={light.position}
          target={light.target}
          angle={0.48}
          penumbra={0.34}
          intensity={light.intensity}
          distance={light.distance}
          decay={2}
          color="#f7fafc"
        />
      ))}

      <pointLight position={[0, 2.8, 0]} intensity={0.62} distance={6.6} decay={2} color="#f1f5fa" />
      <pointLight position={[0, 5.9, 6.3]} intensity={1.25} distance={8.6} decay={2} color="#f5f8fb" />
    </>
  )
}
