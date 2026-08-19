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
const _previewTarget = new THREE.Vector3()
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

function getApproachTurnWeight(route, index, nextIndex, progress) {
  const frame = route[index]
  const nextFrame = route[nextIndex]

  if (frame?.targetMode !== 'forward' || !nextFrame || nextFrame.targetMode === 'forward') {
    return 0
  }

  const start = frame.approachTurnStart ?? CONFIG.autoRoam.approachTurnStart ?? 0.18
  const end = frame.approachTurnEnd ?? CONFIG.autoRoam.approachTurnEnd ?? 0.82
  const range = Math.max(end - start, 1e-5)
  const t = THREE.MathUtils.clamp((progress - start) / range, 0, 1)

  return t * t * (3 - 2 * t)
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

function resolveForwardPreviewTarget(route, index, output) {
  const nextIndex = index + 1 < route.length ? index + 1 : 0

  output.copy(route[index].position)
  sampleSegmentDirection(route, index, nextIndex, 0, _forwardDirection)

  if (_forwardDirection.lengthSq() < 1e-6) {
    _forwardDirection.subVectors(route[nextIndex].position, route[index].position)
  }

  if (_forwardDirection.lengthSq() > 1e-6) {
    _forwardDirection.normalize().multiplyScalar(route[index].lookDistance ?? 4.8)
    output.add(_forwardDirection)
  }

  return output
}

function resolveFrameTarget(route, index, nextIndex, progress, position, fallbackTarget) {
  const frame = route[index]
  const approachTurnWeight = getApproachTurnWeight(route, index, nextIndex, progress)

  if (frame.targetMode === 'forward') {
    sampleSegmentDirection(route, index, nextIndex, progress, _forwardDirection)
    if (_forwardDirection.lengthSq() < 1e-6) {
      _forwardDirection.subVectors(route[nextIndex].target, position)
    }

    if (_forwardDirection.lengthSq() > 1e-6) {
      _forwardDirection.normalize().multiplyScalar(frame.lookDistance ?? 4.8)
      _desiredTarget.copy(position).add(_forwardDirection)

      if (approachTurnWeight > 0) {
        _desiredTarget.lerp(route[nextIndex].target, approachTurnWeight)
      }

      return _desiredTarget
    }
  }

  return _desiredTarget.copy(fallbackTarget)
}

// 在路线上找离当前位置最近的采样点（段索引 + 段内进度），用于中断后就近续游
const _nearestSample = new THREE.Vector3()
function findNearestRouteSample(route, position) {
  let bestIndex = 0
  let bestProgress = 0
  let bestDistance = Infinity

  for (let index = 0; index < route.length; index += 1) {
    const nextIndex = index + 1 < route.length ? index + 1 : 0
    const steps = 8

    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps
      sampleSegmentPosition(route, index, nextIndex, progress, _nearestSample)
      const distance = _nearestSample.distanceToSquared(position)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
        bestProgress = progress
      }
    }
  }

  return { index: bestIndex, progress: bestProgress }
}

export function AutoRoamCamera({ active = true, worldLayout, playerPosRef, collisionWorldRef }) {
  const { camera } = useThree()
  const currentIndexRef = useRef(0)
  const segmentProgressRef = useRef(0)
  const pauseRemainingRef = useRef(0)
  const lookTargetRef = useRef(new THREE.Vector3())
  const travelPositionRef = useRef(new THREE.Vector3())
  const collisionCapsuleRef = useRef(createPlayerCollisionCapsule())
  const hasStartedRef = useRef(false)

  const route = useMemo(() => buildAutoRoamKeyframes(worldLayout), [worldLayout])

  // 首次激活：从相机当前位置就近接上路线（出生点即 route[0]，行为与旧版一致）。
  // 再次激活：恢复自动漫游自己的行程位置与视线——自主漫游期间相机去了哪里不影响这里。
  useEffect(() => {
    if (!active || route.length < 2) return

    camera.up.set(0, 1, 0)

    if (!hasStartedRef.current) {
      hasStartedRef.current = true
      const { index, progress } = findNearestRouteSample(route, camera.position)
      currentIndexRef.current = index
      segmentProgressRef.current = progress
      pauseRemainingRef.current = progress < 0.02 ? route[index].hold ?? 0 : 0
      travelPositionRef.current.copy(camera.position)
      resolveExternalCollisionPosition(
        travelPositionRef.current,
        collisionWorldRef,
        CONFIG.player.eyeHeight,
        collisionCapsuleRef.current,
      )

      camera.getWorldDirection(_forwardDirection)
      lookTargetRef.current.copy(camera.position).addScaledVector(_forwardDirection, 3.5)
      return
    }

    camera.position.copy(travelPositionRef.current)
    _lookMatrix.lookAt(camera.position, lookTargetRef.current, camera.up)
    camera.quaternion.setFromRotationMatrix(_lookMatrix)
    if (playerPosRef?.current) {
      playerPosRef.current.x = camera.position.x
      playerPosRef.current.z = camera.position.z
    }
  }, [active, camera, collisionWorldRef, playerPosRef, route])

  useFrame((_, delta) => {
    if (!active || route.length < 2) return

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
          const nextTarget =
            route[nextIndex].targetMode === 'forward'
              ? resolveForwardPreviewTarget(route, nextIndex, _previewTarget)
              : route[nextIndex].target

          _interpolatedTarget.lerpVectors(route[index].target, nextTarget, progress)
          _desiredTarget.copy(_interpolatedTarget)
        }
      }
    }

    currentIndexRef.current = index
    segmentProgressRef.current = progress
    pauseRemainingRef.current = pauseRemaining
    // 调试钩子：自动化测试读取自动漫游内部状态（生产无副作用）
    window.__autoRoamDebug = {
      active,
      index,
      progress: +progress.toFixed(3),
      pause: +pauseRemaining.toFixed(2),
      x: +travelPositionRef.current.x.toFixed(2),
      z: +travelPositionRef.current.z.toFixed(2),
    }

    const approachTurnWeight = getApproachTurnWeight(route, index, nextIndex, progress)

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
    const targetSharpness = THREE.MathUtils.lerp(
      CONFIG.autoRoam.targetSharpness ?? 3.2,
      CONFIG.autoRoam.approachTargetSharpness ?? 4.6,
      approachTurnWeight,
    )
    lookTargetRef.current.lerp(_desiredTarget, getDampAlpha(targetSharpness, delta))
    _lookMatrix.lookAt(camera.position, lookTargetRef.current, camera.up)
    _desiredQuaternion.setFromRotationMatrix(_lookMatrix)
    const maxTurnSpeed = THREE.MathUtils.lerp(
      CONFIG.autoRoam.maxTurnSpeed ?? 0.72,
      CONFIG.autoRoam.approachMaxTurnSpeed ?? 0.84,
      approachTurnWeight,
    )
    camera.quaternion.rotateTowards(_desiredQuaternion, maxTurnSpeed * delta)

    if (playerPosRef?.current) {
      playerPosRef.current.x = camera.position.x
      playerPosRef.current.z = camera.position.z
    }
  })

  return null
}
