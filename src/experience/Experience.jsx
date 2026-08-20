import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Lights } from './Lights.jsx'
import { SceneEnvironment } from './SceneEnvironment.jsx'
import { Hall } from './Hall.jsx'
import { Player } from './Player.jsx'
import { GltfModel } from './GltfModel.jsx'
import { AutoRoamCamera } from './AutoRoamCamera.jsx'
import { TrophyDisplay } from './TrophyDisplay.jsx'
import { CONFIG } from '../data/config.js'
import { getAutoRoamStartPose } from '../data/autoRoam.js'
import { createPlayerCollisionCapsule, resolveExternalCollisionPosition } from './collision.js'
import { getValidatedSpawnPose } from './spawnPose.js'

function InitialSpawnCamera({ worldLayout, collisionWorldRef, playerPosRef, usingExternalModel, onSynced }) {
  const { camera } = useThree()
  const collisionCapsule = useRef(createPlayerCollisionCapsule())

  useLayoutEffect(() => {
    if (usingExternalModel && !worldLayout) return

    // 统一出生位姿：与 Player 共用同一份带校验缓存的位姿，避免互相覆盖
    const { position, target } = getValidatedSpawnPose(worldLayout, collisionWorldRef?.current)
    camera.up.set(0, 1, 0)
    camera.position.copy(position)

    if (usingExternalModel) {
      resolveExternalCollisionPosition(
        camera.position,
        collisionWorldRef,
        CONFIG.player.eyeHeight,
        collisionCapsule.current,
      )
    }

    camera.lookAt(target)
    camera.updateMatrixWorld()

    if (playerPosRef?.current) {
      playerPosRef.current.x = camera.position.x
      playerPosRef.current.z = camera.position.z
    }

    onSynced?.(true)
  }, [camera, collisionWorldRef, onSynced, playerPosRef, usingExternalModel, worldLayout])

  return null
}

function StaticShadowMaps({ ready }) {
  const { gl } = useThree()

  useEffect(() => {
    if (!ready) return undefined

    let nextFrame = 0
    const freezeTimer = window.requestAnimationFrame(() => {
      nextFrame = window.requestAnimationFrame(() => {
        gl.shadowMap.autoUpdate = false
      })
    })

    gl.shadowMap.autoUpdate = true
    gl.shadowMap.needsUpdate = true

    return () => {
      window.cancelAnimationFrame(freezeTimer)
      window.cancelAnimationFrame(nextFrame)
      gl.shadowMap.autoUpdate = true
      gl.shadowMap.needsUpdate = true
    }
  }, [gl, ready])

  return null
}

export function Experience({
  mode,
  onSelectPicture,
  onSelectExhibit,
  onSelectTrophy,
  onReady,
  onLockChange,
  frozen,
  hoverEnabled = true,
  onHoverHint,
  playerPosRef,
  onWorldLayout,
  worldLayout,
}) {
  const collisionWorldRef = useRef(null)
  const isManualRoam = mode === 'roam'
  const isAutoRoam = mode === 'auto'
  const isInspect = mode === 'inspect'
  const usingExternalModel = Boolean(CONFIG.modelUrl)
  const initialSpawnPose = useMemo(() => getAutoRoamStartPose(), [])
  const [spawnReady, setSpawnReady] = useState(!usingExternalModel)

  useEffect(() => {
    if (usingExternalModel && !worldLayout) {
      setSpawnReady(false)
    }
  }, [usingExternalModel, worldLayout])

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.AgXToneMapping
        gl.toneMappingExposure = 1.08
      }}
      style={{ opacity: spawnReady ? 1 : 0 }}
      camera={{
        position: [
          initialSpawnPose.position.x,
          initialSpawnPose.position.y,
          initialSpawnPose.position.z,
        ],
        fov: 55,
        near: 0.25,
        far: 80,
      }}
    >
      <color attach="background" args={['#dfe8fb']} />
      <fog attach="fog" args={['#e8eefc', 18, 58]} />

      <SceneEnvironment />
      <Lights />

      <Suspense fallback={null}>
        {usingExternalModel ? (
          <GltfModel
            url={CONFIG.modelUrl}
            collisionWorldRef={collisionWorldRef}
            onWorldLayout={onWorldLayout}
            onSelectPicture={onSelectPicture}
            onSelectExhibit={onSelectExhibit}
            hoverEnabled={hoverEnabled}
            onHoverHint={onHoverHint}
          />
        ) : (
          <Hall />
        )}
      </Suspense>

      {!usingExternalModel ? <TrophyDisplay onSelectTrophy={onSelectTrophy} /> : null}

      <InitialSpawnCamera
        worldLayout={worldLayout}
        collisionWorldRef={collisionWorldRef}
        playerPosRef={playerPosRef}
        usingExternalModel={usingExternalModel}
        onSynced={setSpawnReady}
      />
      <StaticShadowMaps ready={spawnReady} />

      <Player
        active={isManualRoam && !frozen}
        onReady={onReady}
        onLockChange={onLockChange}
        playerPosRef={playerPosRef}
        collisionWorldRef={collisionWorldRef}
        worldLayout={worldLayout}
      />

      {/* 常驻挂载：active 切换启停，避免卸载丢失漫游进度（每次重开都回出生点） */}
      <AutoRoamCamera
        active={isAutoRoam && !frozen}
        worldLayout={worldLayout}
        playerPosRef={playerPosRef}
        collisionWorldRef={collisionWorldRef}
      />

      {isInspect && !frozen ? (
        <OrbitControls
          makeDefault
          enablePan
          target={[0, CONFIG.player.eyeHeight * 0.75, 0]}
          minDistance={4}
          maxDistance={36}
          maxPolarAngle={Math.PI / 2 - 0.04}
        />
      ) : null}
    </Canvas>
  )
}
