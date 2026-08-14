import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CONFIG } from '../data/config.js'
import { buildAutoRoamKeyframes } from '../data/autoRoam.js'
import {
  COLLISION_STEP,
  createPlayerCollisionCapsule,
  resolveExternalCollisionPosition,
} from './collision.js'

const _desiredPosition = new THREE.Vector3()
const _desiredTarget = new THREE.Vector3()
const _interpolatedPosition = new THREE.Vector3()
const _interpolatedTarget = new THREE.Vector3()
const _smoothedPosition = new THREE.Vector3()
const _movementDelta = new THREE.Vector3()
const _movementStep = new THREE.Vector3()
const _forwardDirection = new THREE.Vector3()
const _lookMatrix = new THREE.Matrix4()
const _desiredQuaternion = new THREE.Quaternion()

function getSegmentDistance(route, index, nextIndex) {
  return Math.max(route[index].position.distanceTo(route[nextIndex].position), 1e-5)
}

function getDampAlpha(sharpness, delta) {
  return 1 - Math.exp(-sharpness * delta)
}

function getEasedProgress(value) {
  return value * value * value * (value * (value * 6 - 15) + 10)
}

function resolveFrameTarget(route, index, nextIndex, position, fallbackTarget) {
  const frame = route[index]

  if (frame.targetMode === 'forward') {
    _forwardDirection.subVectors(route[nextIndex].position, frame.position)
    if (_forwardDirection.lengthSq() < 1e-6) {
      _forwardDirection.subVectors(route[nextIndex].target, position)
    }

    if (_forwardDirection.lengthSq() > 1e-6) {
      _forwardDirection.normalize().multiplyScalar(frame.lookDistance ?? 4.8)
      return _desiredTarget.copy(position).add(_forwardDirection)
    }
  }

  return _desiredTarget.copy(fallbackTarget)
}

export function AutoRoamCamera({ onFocused, worldLayout, playerPosRef, collisionWorldRef }) {
  const { camera } = useThree()
  const currentIndexRef = useRef(0)
  const segmentProgressRef = useRef(0)
  const pauseRemainingRef = useRef(0)
  const lookTargetRef = useRef(new THREE.Vector3())
  const travelPositionRef = useRef(new THREE.Vector3())
  const collisionCapsuleRef = useRef(createPlayerCollisionCapsule())

  const route = useMemo(() => buildAutoRoamKeyframes(worldLayout), [worldLayout])

  useEffect(() => {
    if (!route.length) return

    console.log('[autoRoam diag] transform =', worldLayout && worldLayout.transform)
    console.log('[autoRoam diag] center =', worldLayout && worldLayout.centerX, worldLayout && worldLayout.centerZ, 'half =', worldLayout && worldLayout.halfWidth, worldLayout && worldLayout.halfDepth)
    console.log('[autoRoam diag] honor frame  pos =', route[1] && route[1].position && route[1].position.toArray(), 'target =', route[1] && route[1].target && route[1].target.toArray())

    currentIndexRef.current = 0
    segmentProgressRef.current = 0
    pauseRemainingRef.current = route[0].hold ?? 0
    camera.up.set(0, 1, 0)
    travelPositionRef.current.copy(route[0].position)
    resolveExternalCollisionPosition(
      travelPositionRef.current,
      collisionWorldRef,
      CONFIG.player.eyeHeight,
      collisionCapsuleRef.current,
    )
    camera.position.copy(travelPositionRef.current)
    lookTargetRef.current.copy(route[0].target)
    _lookMatrix.lookAt(camera.position, lookTargetRef.current, camera.up)
    camera.quaternion.setFromRotationMatrix(_lookMatrix)
    onFocused?.(null)
  }, [camera, collisionWorldRef, onFocused, route])

  useFrame((_, delta) => {
    if (route.length < 2) return

    let index = currentIndexRef.current
    let progress = segmentProgressRef.current
    let pauseRemaining = pauseRemainingRef.current
    let nextIndex = index + 1 < route.length ? index + 1 : 0

    _desiredPosition.copy(route[index].position)
    resolveFrameTarget(route, index, nextIndex, _desiredPosition, route[index].target)

    if (pauseRemaining > 0) {
      pauseRemaining = Math.max(0, pauseRemaining - delta)
    } else {
      let remainingTime = delta

      while (remainingTime > 1e-6) {
        nextIndex = index + 1 < route.length ? index + 1 : 0
        const segmentDistance = getSegmentDistance(route, index, nextIndex)
        const segmentSpeed = route[nextIndex].speed ?? route[index].speed ?? CONFIG.autoRoam.speed ?? 3.2
        const segmentTimeLeft = ((1 - progress) * segmentDistance) / segmentSpeed

        if (remainingTime + 1e-6 >= segmentTimeLeft) {
          remainingTime -= segmentTimeLeft
          index = nextIndex
          progress = 0
          nextIndex = index + 1 < route.length ? index + 1 : 0
          _desiredPosition.copy(route[index].position)
          resolveFrameTarget(route, index, nextIndex, _desiredPosition, route[index].target)

          if (!CONFIG.autoRoam.loop && index === route.length - 1) {
            remainingTime = 0
            break
          }

          pauseRemaining = route[index].hold ?? 0
          if (pauseRemaining > 0) break
          continue
        }

        progress += (remainingTime * segmentSpeed) / segmentDistance
        remainingTime = 0

        const easedProgress = getEasedProgress(progress)
        _interpolatedPosition.lerpVectors(route[index].position, route[nextIndex].position, easedProgress)
        _desiredPosition.copy(_interpolatedPosition)
        if (route[index].targetMode === 'forward') {
          resolveFrameTarget(route, index, nextIndex, _desiredPosition, route[index].target)
        } else {
          _interpolatedTarget.lerpVectors(route[index].target, route[nextIndex].target, easedProgress)
          _desiredTarget.copy(_interpolatedTarget)
        }
      }
    }

    currentIndexRef.current = index
    segmentProgressRef.current = progress
    pauseRemainingRef.current = pauseRemaining

    const positionAlpha = getDampAlpha(CONFIG.autoRoam.positionSharpness ?? 7.5, delta)
    _smoothedPosition.lerpVectors(travelPositionRef.current, _desiredPosition, positionAlpha)
    _movementDelta.subVectors(_smoothedPosition, travelPositionRef.current)

    if (collisionWorldRef?.current && _movementDelta.lengthSq() > 0) {
      const distance = _movementDelta.length()
      const steps = Math.max(1, Math.ceil(distance / COLLISION_STEP))
      _movementStep.copy(_movementDelta).multiplyScalar(1 / steps)

      for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
        travelPositionRef.current.add(_movementStep)
        resolveExternalCollisionPosition(
          travelPositionRef.current,
          collisionWorldRef,
          CONFIG.player.eyeHeight,
          collisionCapsuleRef.current,
        )
      }
    } else {
      travelPositionRef.current.copy(_smoothedPosition)
    }

    camera.position.copy(travelPositionRef.current)
    lookTargetRef.current.lerp(_desiredTarget, getDampAlpha(CONFIG.autoRoam.targetSharpness ?? 3.2, delta))
    _lookMatrix.lookAt(camera.position, lookTargetRef.current, camera.up)
    _desiredQuaternion.setFromRotationMatrix(_lookMatrix)
    camera.quaternion.rotateTowards(_desiredQuaternion, (CONFIG.autoRoam.maxTurnSpeed ?? 0.72) * delta)

    if (playerPosRef?.current) {
      playerPosRef.current.x = camera.position.x
      playerPosRef.current.z = camera.position.z
    }
  })

  return null
}
