import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Lights } from './Lights.jsx'
import { Hall } from './Hall.jsx'
import { Hotspot } from './Hotspot.jsx'
import { Player } from './Player.jsx'
import { GltfModel } from './GltfModel.jsx'
import { AutoRoamCamera } from './AutoRoamCamera.jsx'
import { TrophyDisplay } from './TrophyDisplay.jsx'
import { CONFIG } from '../data/config.js'

export function Experience({ mode, hotspots, onSelect, onSelectTrophy, onReady, onLockChange, onFocused, frozen, playerPosRef }) {
  const markersRef = useRef([])
  const isManualRoam = mode === 'roam'
  const isAutoRoam = mode === 'auto'
  const isInspect = mode === 'inspect'
  const usingExternalModel = Boolean(CONFIG.modelUrl)

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, CONFIG.player.eyeHeight, 13], fov: 55, near: 0.25, far: 80 }}
    >
      <color attach="background" args={['#dfe8fb']} />
      <fog attach="fog" args={['#e8eefc', 18, 58]} />

      <Lights />

      <Suspense fallback={null}>
        {usingExternalModel ? <GltfModel url={CONFIG.modelUrl} /> : <Hall />}
      </Suspense>

      {!usingExternalModel
        ? hotspots.map((hotspot) => (
            <Hotspot key={hotspot.id} data={hotspot} markersRef={markersRef} onSelect={onSelect} />
          ))
        : null}

      {!usingExternalModel ? <TrophyDisplay onSelectTrophy={onSelectTrophy} /> : null}

      <Player
        active={isManualRoam && !frozen}
        onReady={onReady}
        onLockChange={onLockChange}
        onFocused={onFocused}
        markersRef={markersRef}
        onSelect={onSelect}
        playerPosRef={playerPosRef}
      />

      {isAutoRoam && !frozen ? <AutoRoamCamera onFocused={onFocused} /> : null}

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
