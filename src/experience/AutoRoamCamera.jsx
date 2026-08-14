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
const _interpolatedTarget = new THREE.Vector3()
const _smoothedPosition = new THREE.Vector3()
const _movementDelta = new THREE.Vector3()
const _movementStep = new THREE.Vector3()
const _forwardDirection = new THREE.Vector3()
const _lookMatrix = new THREE.Matrix4()
const _desiredQuaternion = new THREE.Quaternion()
const _curvePoints = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
const _segmentCurve = new THREE.CatmullRomCurve3(_curvePoints, false, 'centripetal')

function getSegmentDistance(route, index, nextIndex) {
  return Math.max(route[index].position.distanceTo(route[nextIndex].position), 1e-5)
}

function getDampAlpha(sharpness, delta) {
  return 1 - Math.exp(-sharpness * delta)
}

function resolveRouteIndex(route, index) {
  if (CONFIG.autoRoam.loop) {
    return (index + route.length) % route.length
  }

  return Math.min(Math.max(index, 0), route.length - 1)
}

function useCurveSegment(route, index, nextIndex) {
  return route[index]?.targetMode === 'forward'
}

function configureSegmentCurve(route, index, nextIndex) {
  const prevIndex = resolveRouteIndex(route, index - 1)
  const afterIndex = resolveRouteIndex(route, nextIndex + 1)

  _curvePoints[0].copy(route[prevIndex].position)
  _curvePoints[1].copy(route[index].position)
  _curvePoints[2].copy(route[nextIndex].position)
  _curvePoints[3].copy(route[afterIndex].position)
}

function getCurveProgress(progress) {
  return 1 / 3 + progress / 3
}

function sampleSegmentPosition(route, index, nextIndex, progress, output) {
  if (!useCurveSegment(route, index, nextIndex)) {
    return output.lerpVectors(route[index].position, route[nextIndex].position, progress)
  }

  configureSegmentCurve(route, index, nextIndex)
  return _segmentCurve.getPoint(getCurveProgress(progress), output)
}

function sampleSegmentDirection(route, index, nextIndex, progress, output) {
  if (!useCurveSegment(route, index, nextIndex)) {
    return output.subVectors(route[nextIndex].position, route[index].position)
  }

  configureSegmentCurve(route, index, nextIndex)
  return _segmentCurve.getTangent(getCurveProgress(progress), output)
}

function resolveFrameTarget(route, index, nextIndex, progress, position, fallbackTarget) {
  const frame = route[index]

  if (frame.targetMode === 'forward') {
    sampleSegmentDirection(route, index, nextIndex, progress, _forwardDirection)
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
    resolveFrameTarget(route, 0, route.length > 1 ? 1 : 0, 0, camera.position, route[0].target)
    lookTargetRef.current.copy(_desiredTarget)
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
    resolveFrameTarget(route, index, nextIndex, progress, _desiredPosition, route[index].target)

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
          resolveFrameTarget(route, index, nextIndex, progress, _desiredPosition, route[index].target)

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

        sampleSegmentPosition(route, index, nextIndex, progress, _desiredPosition)
        if (route[index].targetMode === 'forward') {
          resolveFrameTarget(route, index, nextIndex, progress, _desiredPosition, route[index].target)
        } else {
          _interpolatedTarget.lerpVectors(route[index].target, route[nextIndex].target, progress)
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
