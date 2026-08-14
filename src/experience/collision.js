import * as THREE from 'three'
import { Capsule } from 'three/examples/jsm/math/Capsule.js'
import { CONFIG } from '../data/config.js'

export const PLAYER_RADIUS = 0.35
export const COLLISION_STEP = PLAYER_RADIUS * 0.5
export const PLAYER_COLLIDER_BOTTOM = PLAYER_RADIUS + 0.02
export const PLAYER_HEAD_CLEARANCE = 0.12

const _push = new THREE.Vector3()

export function createPlayerCollisionCapsule(eyeHeight = CONFIG.player.eyeHeight) {
  return new Capsule(
    new THREE.Vector3(0, PLAYER_COLLIDER_BOTTOM, 0),
    new THREE.Vector3(0, eyeHeight - PLAYER_HEAD_CLEARANCE, 0),
    PLAYER_RADIUS,
  )
}

export function resolveExternalCollisionPosition(position, collisionWorldRef, eyeHeight, collisionCapsule) {
  const collisionWorld = collisionWorldRef?.current ?? collisionWorldRef
  if (!collisionWorld) return false

  collisionCapsule.start.set(position.x, PLAYER_COLLIDER_BOTTOM, position.z)
  collisionCapsule.end.set(position.x, eyeHeight - PLAYER_HEAD_CLEARANCE, position.z)

  const hit = collisionWorld.capsuleIntersect(collisionCapsule)
  if (!hit) return false

  _push.copy(hit.normal).multiplyScalar(hit.depth)
  collisionCapsule.translate(_push)
  position.x = collisionCapsule.end.x
  position.z = collisionCapsule.end.z
  return true
}
