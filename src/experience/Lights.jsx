import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CONFIG } from '../data/config.js'

function AimedSpotLight({
  target,
  castShadow = false,
  shadowMapSize = [768, 768],
  shadowNear = 0.6,
  shadowFar = 12,
  shadowBias = -0.00008,
  shadowNormalBias = 0.02,
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
        {...props}
      />
    </>
  )
}

export function Lights() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  // 环境贴图补光（IBL）：模型原版（Unity）带天空盒/反射探针，three 场景此前只有
  // 分析型灯光——金属材质（玻璃等）没有环境可反射时渲染成黑色，展厅边缘的柜内
  // 展品也只剩环境光、观感偏暗。用中性室内环境生成 PMREM 做全场柔和补光，
  // 不替换背景色，只影响材质光照；强度压低保持整体素净。
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envRT.texture
    // 强度需克制：场景已有环境光+半球光打底，IBL 只补暗部（金属反射/柜内展品）；
    // 调高会让整体发白蒙雾、自发光面板（大屏/照片墙）被镜面反射罩灰。
    scene.environmentIntensity = 0.3
    return () => {
      scene.environment = null
      envRT.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])

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
        intensity: 5.8,
        distance: 9.2,
      },
      {
        key: `back-${x}`,
        position: [x, ceilingY, -roomCenterZ],
        target: [x, 1.1, -roomCenterZ],
        intensity: 5.8,
        distance: 9.2,
      },
    ])
  }, [])

  const sideLightX = CONFIG.hall.width / 2 - 0.55
  const ceilingY = CONFIG.hall.height - 0.42
  const sandTableCenterX = CONFIG.hall.sandTable?.centerX ?? -6.1
  const sandTableCenterZ = CONFIG.hall.sandTable?.centerZ ?? 0

  return (
    <>
      <hemisphereLight args={['#f7fafc', '#c8d0d8', 0.82]} />
      <ambientLight intensity={0.42} color="#f7f9fc" />

      {/* 仅保留弱化的整体补光，不再让它产生室内假阴影。 */}
      <directionalLight position={[6, 10, 4]} intensity={0.28} color="#eef3f9" />

      <AimedSpotLight
        position={[0, ceilingY, 0]}
        target={[0, 0.95, 0]}
        angle={0.82}
        penumbra={0.62}
        intensity={9.1}
        distance={15.5}
        decay={2}
        color="#fbfdff"
        castShadow
        shadowMapSize={[1024, 1024]}
        shadowFar={16}
        shadowNormalBias={0.028}
      />

      <AimedSpotLight
        position={[sandTableCenterX, ceilingY - 0.12, sandTableCenterZ]}
        target={[sandTableCenterX, 1.05, sandTableCenterZ]}
        angle={0.5}
        penumbra={0.58}
        intensity={5.9}
        distance={9.4}
        decay={2}
        color="#f5f8fb"
        castShadow
        shadowMapSize={[768, 768]}
        shadowFar={10}
        shadowNormalBias={0.024}
      />

      <AimedSpotLight
        position={[-sideLightX, ceilingY, 0]}
        target={[-sideLightX + 0.35, 1.55, 0]}
        angle={0.56}
        penumbra={0.55}
        intensity={4.1}
        distance={8.2}
        decay={2}
        color="#eef4fa"
      />

      <AimedSpotLight
        position={[sideLightX, ceilingY, 0]}
        target={[sideLightX - 0.35, 1.55, 0]}
        angle={0.56}
        penumbra={0.55}
        intensity={4.1}
        distance={8.2}
        decay={2}
        color="#eef4fa"
      />

      {roomLights.map((light) => (
        <AimedSpotLight
          key={light.key}
          position={light.position}
          target={light.target}
          angle={0.58}
          penumbra={0.52}
          intensity={light.intensity * 0.94}
          distance={light.distance}
          decay={2}
          color="#f7fafc"
        />
      ))}

      <pointLight position={[0, 2.8, 0]} intensity={0.9} distance={8.2} decay={2} color="#f1f5fa" />
      <pointLight position={[0, 5.9, 6.3]} intensity={1.8} distance={10.8} decay={2} color="#f5f8fb" />
    </>
  )
}
