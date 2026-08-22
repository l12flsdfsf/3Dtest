import * as THREE from 'three'
import { Capsule } from 'three/examples/jsm/math/Capsule.js'
import { CONFIG } from '../data/config.js'

export const PLAYER_RADIUS = 0.35
export const COLLISION_STEP = PLAYER_RADIUS * 0.5
export const PLAYER_COLLIDER_BOTTOM = PLAYER_RADIUS + 0.02
export const PLAYER_HEAD_CLEARANCE = 0.12

const _push = new THREE.Vector3()
// Ignore a purely vertical result, but preserve the XZ response when several
// nearby surfaces contribute to the same capsule intersection.
const MIN_HORIZONTAL_NORMAL = 1e-4

export function createPlayerCollisionCapsule(eyeHeight = CONFIG.player.eyeHeight) {
  return new Capsule(
    new THREE.Vector3(0, PLAYER_COLLIDER_BOTTOM, 0),
    new THREE.Vector3(0, eyeHeight - PLAYER_HEAD_CLEARANCE, 0),
    PLAYER_RADIUS,
  )
}

export function resolveExternalCollisionPosition(position, collisionWorldRef, eyeHeight, collisionCapsule) {
  const collisionWorld =
    collisionWorldRef && typeof collisionWorldRef === 'object' && 'current' in collisionWorldRef
      ? collisionWorldRef.current
      : collisionWorldRef

  if (!collisionWorld || typeof collisionWorld.capsuleIntersect !== 'function') return false

  collisionCapsule.start.set(position.x, PLAYER_COLLIDER_BOTTOM, position.z)
  collisionCapsule.end.set(position.x, eyeHeight - PLAYER_HEAD_CLEARANCE, position.z)

  const hit = collisionWorld.capsuleIntersect(collisionCapsule)
  if (!hit) return false

  _push.set(hit.normal.x, 0, hit.normal.z)
  const horizontalLength = _push.length()
  if (horizontalLength < MIN_HORIZONTAL_NORMAL) return false

  _push.multiplyScalar(hit.depth / horizontalLength)
  collisionCapsule.translate(_push)
  position.x = collisionCapsule.end.x
  position.z = collisionCapsule.end.z
  return true
}
