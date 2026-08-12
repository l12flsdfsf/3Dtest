import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CONFIG } from '../data/config.js'

const _position = new THREE.Vector3()
const _target = new THREE.Vector3()

export function AutoRoamCamera({ onFocused }) {
  const { camera } = useThree()
  const progressRef = useRef(0)

  const curve = useMemo(() => {
    const points = CONFIG.autoRoam.points.map((point) => new THREE.Vector3(...point))
    return new THREE.CatmullRomCurve3(points, CONFIG.autoRoam.loop, 'centripetal')
  }, [])

  const curveLength = useMemo(() => curve.getLength(), [curve])

  useEffect(() => {
    progressRef.current = 0
    camera.up.set(0, 1, 0)
    curve.getPointAt(0, _position)
    curve.getPointAt(CONFIG.autoRoam.lookAhead, _target)
    camera.position.copy(_position)
    camera.lookAt(_target)
    onFocused?.(null)
  }, [camera, curve, onFocused])

  useFrame((_, delta) => {
    const deltaT = (CONFIG.autoRoam.speed * delta) / curveLength
    const nextProgress = progressRef.current + deltaT

    if (CONFIG.autoRoam.loop) {
      progressRef.current = nextProgress % 1
    } else {
      progressRef.current = Math.min(nextProgress, 1)
    }

    const lookAhead = CONFIG.autoRoam.loop
      ? (progressRef.current + CONFIG.autoRoam.lookAhead) % 1
      : Math.min(progressRef.current + CONFIG.autoRoam.lookAhead, 1)

    curve.getPointAt(progressRef.current, _position)
    curve.getPointAt(lookAhead, _target)

    camera.position.lerp(_position, 0.12)
    camera.lookAt(_target)
  })

  return null
}
