import * as THREE from 'three'
import { getAutoRoamStartPose } from '../data/autoRoam.js'
import { CONFIG } from '../data/config.js'
import { projectHallLayoutToWorldPosition } from '../data/halls.js'
import {
  PLAYER_COLLIDER_BOTTOM,
  PLAYER_HEAD_CLEARANCE,
  createPlayerCollisionCapsule,
} from './collision.js'

// 统一的出生位姿来源（带按布局缓存）：
// 之前 InitialSpawnCamera、Player.applySpawnPose 各自调 getAutoRoamStartPose 摆相机，
// worldLayout 变化时互相覆盖；且外部模型的漫游起点可能落在死角/面墙。
// 这里在碰撞体可用时对起点做一次校验（不嵌体 + 前方开阔），不合格就地在周围
// 螺旋搜索空位并缓存，之后所有调用方拿到的都是同一个修正后的位姿。
const poseCache = new WeakMap()

const _ray = new THREE.Ray()
const _dir = new THREE.Vector3()
const _capsule = createPlayerCollisionCapsule()

function capsuleFreeAt(collisionWorld, x, z) {
  const eyeHeight = CONFIG.player.eyeHeight
  _capsule.start.set(x, PLAYER_COLLIDER_BOTTOM, z)
  _capsule.end.set(x, eyeHeight - PLAYER_HEAD_CLEARANCE, z)
  return !collisionWorld.capsuleIntersect(_capsule)
}

function forwardClearance(collisionWorld, x, z, dirX, dirZ) {
  _ray.origin.set(x, CONFIG.player.eyeHeight * 0.7, z)
  _dir.set(dirX, 0, dirZ).normalize()
  _ray.direction.copy(_dir)
  const hit = collisionWorld.rayIntersect(_ray)
  return hit && Number.isFinite(hit.distance) ? hit.distance : Infinity
}

// 绕起点螺旋搜索：半径 0.6~7m × 16 方向，取第一个「无碰撞 且 前方 ≥1.5m 开阔」的点。
// 朝向优先级：展厅中心方向（天然朝向厅内）→ 原漫游朝向 → 最开阔方向。
function findClearSpot(collisionWorld, position, originalForward, centerDirection) {
  const facings = []
  if (centerDirection && centerDirection.lengthSq() > 1e-6) facings.push(centerDirection.clone().normalize())
  if (originalForward && originalForward.lengthSq() > 1e-6) facings.push(originalForward.clone().normalize())

  for (const radius of [0.6, 1.2, 1.8, 2.6, 3.6, 5, 7]) {
    for (let sector = 0; sector < 16; sector += 1) {
      const angle = (sector / 16) * Math.PI * 2
      const x = position.x + Math.cos(angle) * radius
      const z = position.z + Math.sin(angle) * radius
      if (!capsuleFreeAt(collisionWorld, x, z)) continue

      for (const facing of facings) {
        if (forwardClearance(collisionWorld, x, z, facing.x, facing.z) >= 1.5) {
          return { position: new THREE.Vector3(x, CONFIG.player.eyeHeight, z), direction: facing }
        }
      }

      let best = null
      for (let look = 0; look < 8; look += 1) {
        const lookAngle = (look / 8) * Math.PI * 2
        const distance = forwardClearance(collisionWorld, x, z, Math.cos(lookAngle), Math.sin(lookAngle))
        if (!best || distance > best.distance) {
          best = { distance, direction: new THREE.Vector3(Math.cos(lookAngle), 0, Math.sin(lookAngle)) }
        }
      }
      if (best && best.distance >= 1.5) {
        return { position: new THREE.Vector3(x, CONFIG.player.eyeHeight, z), direction: best.direction }
      }
    }
  }
  return null
}

function poseToTarget(pose) {
  return pose.target ? pose.target : pose.position.clone().add(new THREE.Vector3(0, 0, 5))
}

export function getValidatedSpawnPose(worldLayout, collisionWorld) {
  if (!worldLayout) return getAutoRoamStartPose(worldLayout)

  let entry = poseCache.get(worldLayout)
  if (!entry) {
    entry = { pose: getAutoRoamStartPose(worldLayout), validated: false }
    poseCache.set(worldLayout, entry)
  }
  if (entry.validated) return entry.pose
  if (!collisionWorld || typeof collisionWorld.capsuleIntersect !== 'function') return entry.pose

  entry.validated = true
  const raw = entry.pose
  const eyeHeight = CONFIG.player.eyeHeight

  const free = capsuleFreeAt(collisionWorld, raw.position.x, raw.position.z)
  const forward = new THREE.Vector3()
  forward.subVectors(poseToTarget(raw), raw.position)
  forward.y = 0
  if (forward.lengthSq() > 1e-6) {
    forward.normalize()
  } else {
    forward.set(0, 0, 1)
  }
  const clear = forwardClearance(collisionWorld, raw.position.x, raw.position.z, forward.x, forward.z)

  if (free && clear >= 1.2) return raw // 原始起点没问题

  // 展厅中心方向（模型世界坐标），出生朝向的兜底偏好：朝向厅内
  const center = projectHallLayoutToWorldPosition(0, 0, worldLayout)
  const centerDirection = new THREE.Vector3(
    (center.x ?? 0) - raw.position.x,
    0,
    (center.z ?? 0) - raw.position.z,
  )

  const spot = findClearSpot(collisionWorld, raw.position, forward, centerDirection)
  if (!spot) return raw

  console.info(
    '[spawn] 起点不可用(free=' + free + ', 前方' + (clear === Infinity ? '∞' : clear.toFixed(1)) + 'm)，迁移到',
    spot.position.x.toFixed(2),
    spot.position.z.toFixed(2),
  )
  entry.pose = {
    position: spot.position,
    target: spot.position.clone().add(spot.direction),
  }
  return entry.pose
}
