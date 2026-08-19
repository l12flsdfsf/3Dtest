import { useCallback, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CONFIG } from '../data/config.js'
import { getAutoRoamStartPose } from '../data/autoRoam.js'
import { getValidatedSpawnPose } from './spawnPose.js'
import {
  HALLS,
  LOCAL_ANCHORS,
  roomToWorld,
  MODEL_PLINTH_HALF,
  getHallCanonicalCenter,
  projectHallLayoutToWorldPosition,
} from '../data/halls.js'
import {
  COLLISION_STEP,
  PLAYER_COLLIDER_BOTTOM,
  PLAYER_HEAD_CLEARANCE,
  PLAYER_RADIUS,
  createPlayerCollisionCapsule,
  resolveExternalCollisionPosition,
} from './collision.js'

const LOOK_SENSITIVITY = 0.0024
const MAX_PITCH = Math.PI / 2 - 0.05
const DOOR_HALF = 1.15
const USING_EXTERNAL_MODEL = Boolean(CONFIG.modelUrl)

const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _move = new THREE.Vector3()
const _step = new THREE.Vector3()

function buildCollisionWalls() {
  const { width, depth, centralStage, sandTable } = CONFIG.hall
  const halfDepth = depth / 2
  const corridorHalf = CONFIG.hall.corridorHalf ?? 4
  const dividerX = width / 6
  const roomHalf = width / 6
  const thickness = 0.12
  const centers = [-width / 3, 0, width / 3]
  const walls = []

  for (const x of [-dividerX, dividerX]) {
    walls.push([x - thickness, x + thickness, corridorHalf, halfDepth])
    walls.push([x - thickness, x + thickness, -halfDepth, -corridorHalf])
  }

  for (const center of centers) {
    walls.push([center - roomHalf, center - DOOR_HALF, corridorHalf - thickness, corridorHalf + thickness])
    walls.push([center + DOOR_HALF, center + roomHalf, corridorHalf - thickness, corridorHalf + thickness])
    walls.push([center - roomHalf, center - DOOR_HALF, -corridorHalf - thickness, -corridorHalf + thickness])
    walls.push([center + DOOR_HALF, center + roomHalf, -corridorHalf - thickness, -corridorHalf + thickness])
  }

  if (centralStage) {
    const sx = centralStage.footprintX / 2 + PLAYER_RADIUS * 0.75
    const sz = centralStage.footprintZ / 2 + PLAYER_RADIUS * 0.75
    walls.push([-sx, sx, -sz, sz])
  }

  if (sandTable) {
    const sx = sandTable.sizeX / 2 + PLAYER_RADIUS * 0.6
    const sz = sandTable.sizeZ / 2 + PLAYER_RADIUS * 0.6
    walls.push([sandTable.centerX - sx, sandTable.centerX + sx, sandTable.centerZ - sz, sandTable.centerZ + sz])
  }

  for (const hall of HALLS) {
    const [px, , pz] = roomToWorld(hall, LOCAL_ANCHORS.model)
    const h = MODEL_PLINTH_HALF
    walls.push([px - h, px + h, pz - h, pz + h])
  }

  return walls
}

const COLLISION_WALLS = USING_EXTERNAL_MODEL ? [] : buildCollisionWalls()

function hitsWall(x, z) {
  const r2 = PLAYER_RADIUS * PLAYER_RADIUS
  for (const [xmin, xmax, zmin, zmax] of COLLISION_WALLS) {
    const cx = x < xmin ? xmin : x > xmax ? xmax : x
    const cz = z < zmin ? zmin : z > zmax ? zmax : z
    const dx = x - cx
    const dz = z - cz
    if (dx * dx + dz * dz < r2) return true
  }
  return false
}

function resolveExternalCollision(camera, collisionWorldRef, eyeHeight, collisionCapsule) {
  resolveExternalCollisionPosition(camera.position, collisionWorldRef, eyeHeight, collisionCapsule)
}

export function Player({
  active,
  onReady,
  onLockChange,
  playerPosRef,
  collisionWorldRef,
  worldLayout,
}) {
  const { camera, gl } = useThree()
  const move = useRef({ f: 0, b: 0, l: 0, r: 0, run: false })
  const collisionCapsule = useRef(createPlayerCollisionCapsule())
  const activeRef = useRef(active)
  const didInitRef = useRef(false)
  const roamingRef = useRef(false)
  const draggingRef = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const spawnPositionRef = useRef(null)
  const spawnWorldLayoutRef = useRef(undefined)
  const hasInteractedSinceSpawnRef = useRef(false)
  const spawnClearedRef = useRef(false)
  // 自主漫游自己的位姿存档：切去自动漫游后相机被移动，切回时恢复到这里
  const manualPoseRef = useRef(null)

  const applySpawnPose = useCallback(
    (layout) => {
      // 统一出生位姿：与 InitialSpawnCamera 共用同一份带校验缓存的位姿，避免互相覆盖
      const { position, target } = getValidatedSpawnPose(layout, collisionWorldRef?.current)

      camera.up.set(0, 1, 0)
      camera.position.copy(position)

      if (USING_EXTERNAL_MODEL) {
        resolveExternalCollision(camera, collisionWorldRef, CONFIG.player.eyeHeight, collisionCapsule.current)
      }

      camera.lookAt(target)
      euler.current.setFromQuaternion(camera.quaternion)
      spawnPositionRef.current = camera.position.clone()
      spawnWorldLayoutRef.current = layout
      hasInteractedSinceSpawnRef.current = false

      if (playerPosRef) {
        playerPosRef.current.x = camera.position.x
        playerPosRef.current.z = camera.position.z
      }
    },
    [camera, collisionWorldRef, playerPosRef],
  )

  const setRoaming = useCallback(
    (value) => {
      if (roamingRef.current === value) return
      roamingRef.current = value
      onLockChange?.(value)

      if (!value) {
        move.current = { f: 0, b: 0, l: 0, r: 0, run: false }
        draggingRef.current = false
      }
    },
    [onLockChange],
  )

  const saveManualPose = useCallback(() => {
    if (!manualPoseRef.current) {
      manualPoseRef.current = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
    }
    manualPoseRef.current.position.copy(camera.position)
    manualPoseRef.current.quaternion.copy(camera.quaternion)
  }, [camera])

  const teleportTo = useCallback((position, lookAt) => {
    camera.up.set(0, 1, 0)
    camera.position.set(position.x, position.y, position.z)

    if (USING_EXTERNAL_MODEL) {
      resolveExternalCollision(camera, collisionWorldRef, CONFIG.player.eyeHeight, collisionCapsule.current)
    }

    const target = new THREE.Vector3(
      lookAt?.x ?? position.x,
      lookAt?.y ?? position.y,
      lookAt?.z ?? position.z + 5,
    )
    camera.lookAt(target)
    euler.current.setFromQuaternion(camera.quaternion)

    if (playerPosRef) {
      playerPosRef.current.x = camera.position.x
      playerPosRef.current.z = camera.position.z
    }

    spawnPositionRef.current = camera.position.clone()
    hasInteractedSinceSpawnRef.current = true
    saveManualPose()
  }, [camera, collisionWorldRef, playerPosRef, saveManualPose])

  useEffect(() => {
    onReady?.({
      lock: () => setRoaming(true),
      unlock: () => setRoaming(false),
      teleportTo,
    })
  }, [onReady, setRoaming, teleportTo])

  useEffect(() => {
    const setKey = (code, value) => {
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          if (value) hasInteractedSinceSpawnRef.current = true
          move.current.f = value ? 1 : 0
          break
        case 'KeyS':
        case 'ArrowDown':
          if (value) hasInteractedSinceSpawnRef.current = true
          move.current.b = value ? 1 : 0
          break
        case 'KeyA':
        case 'ArrowLeft':
          if (value) hasInteractedSinceSpawnRef.current = true
          move.current.l = value ? 1 : 0
          break
        case 'KeyD':
        case 'ArrowRight':
          if (value) hasInteractedSinceSpawnRef.current = true
          move.current.r = value ? 1 : 0
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          move.current.run = value
          break
        case 'Escape':
          if (value && roamingRef.current) setRoaming(false)
          break
        default:
          break
      }
    }

    const onKeyDown = (event) => setKey(event.code, true)
    const onKeyUp = (event) => setKey(event.code, false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [setRoaming])

  useEffect(() => {
    const dom = gl.domElement

    const onContextMenu = (event) => event.preventDefault()
    const onPointerDown = (event) => {
      if (!activeRef.current || event.button !== 2) return
      hasInteractedSinceSpawnRef.current = true
      draggingRef.current = true
      lastPointer.current = { x: event.clientX, y: event.clientY }
      euler.current.setFromQuaternion(camera.quaternion)
      event.preventDefault()
    }

    const onPointerMove = (event) => {
      if (!draggingRef.current) return
      const dx = event.clientX - lastPointer.current.x
      const dy = event.clientY - lastPointer.current.y
      lastPointer.current = { x: event.clientX, y: event.clientY }

      euler.current.y -= dx * LOOK_SENSITIVITY
      euler.current.x -= dy * LOOK_SENSITIVITY
      euler.current.x = THREE.MathUtils.clamp(euler.current.x, -MAX_PITCH, MAX_PITCH)
      camera.quaternion.setFromEuler(euler.current)
    }

    const onPointerUp = (event) => {
      if (event.button === 2) draggingRef.current = false
    }

    dom.addEventListener('contextmenu', onContextMenu)
    dom.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      dom.removeEventListener('contextmenu', onContextMenu)
      dom.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [camera, gl])

  useEffect(() => {
    activeRef.current = active
    if (!active) {
      // 停用瞬间相机还在自主漫游位置上，存档；自动漫游之后怎么移动相机都不影响这份记录
      if (didInitRef.current) saveManualPose()
      setRoaming(false)
      return
    }

    if (manualPoseRef.current && hasInteractedSinceSpawnRef.current) {
      // 从自动漫游（或观察模式）切回：恢复自主漫游上次离开的位置与视角
      const pose = manualPoseRef.current
      camera.up.set(0, 1, 0)
      camera.position.copy(pose.position)
      camera.quaternion.copy(pose.quaternion)
      euler.current.setFromQuaternion(camera.quaternion, 'YXZ')
      spawnPositionRef.current = camera.position.clone()
      if (playerPosRef) {
        playerPosRef.current.x = camera.position.x
        playerPosRef.current.z = camera.position.z
      }
    } else if (!didInitRef.current) {
      applySpawnPose(worldLayout)
      didInitRef.current = true
    } else if (spawnWorldLayoutRef.current !== worldLayout && !hasInteractedSinceSpawnRef.current) {
      applySpawnPose(worldLayout)
    }
    setRoaming(true)
  }, [active, applySpawnPose, camera, playerPosRef, saveManualPose, setRoaming, worldLayout])

  useFrame((_, delta) => {
    // 始终同步相机（玩家）世界坐标到 ref，供展厅地图在打开时取一次快照定位「你在此」。
    if (playerPosRef) {
      playerPosRef.current.x = camera.position.x
      playerPosRef.current.z = camera.position.z
    }
    // 调试钩子：自动化测试读取玩家坐标/碰撞状态（生产无副作用）
    window.__camera = camera
    window.__worldLayout = worldLayout
    window.__teleport = teleportTo
    window.__THREE = THREE
    if (worldLayout?.sceneRoot) window.__scene = worldLayout.sceneRoot
    if (collisionWorldRef?.current) {
      window.__collisionWorld = collisionWorldRef.current
      if (!window.__clearance) {
        const probeRay = new THREE.Ray()
        window.__clearance = (x, y, z, dx, dz) => {
          const length = Math.hypot(dx, dz) || 1
          probeRay.origin.set(x, y, z)
          probeRay.direction.set(dx / length, 0, dz / length)
          const hit = collisionWorldRef.current?.rayIntersect(probeRay)
          return hit && Number.isFinite(hit.distance) ? hit.distance : 999
        }
        window.__capsuleBlocked = (x, z) => {
          const capsule = collisionCapsule.current
          capsule.start.set(x, 0.37, z)
          capsule.end.set(x, CONFIG.player.eyeHeight - 0.12, z)
          return !!collisionWorldRef.current?.capsuleIntersect(capsule)
        }
      }
    }
    if ((window.__playerFrame = (window.__playerFrame || 0) + 1) % 2 === 0) {
      window.__playerDebug = {
        t: Date.now(),
        x: +camera.position.x.toFixed(2),
        y: +camera.position.y.toFixed(2),
        z: +camera.position.z.toFixed(2),
        collision: !!collisionWorldRef?.current,
        roaming: roamingRef.current === true,
        keys: { ...move.current },
      }
    }
    if (!hasInteractedSinceSpawnRef.current && spawnPositionRef.current) {
      const dx = camera.position.x - spawnPositionRef.current.x
      const dz = camera.position.z - spawnPositionRef.current.z
      if (dx * dx + dz * dz > 1.44) {
        hasInteractedSinceSpawnRef.current = true
      }
    }
    if (!active || !roamingRef.current) return

    // 碰撞体就绪后（构建是异步的，可能晚于出生）做一次出生点校验/迁移：
    // 校验逻辑与缓存在 spawnPose.js，InitialSpawnCamera 与 applySpawnPose 拿同一份结果
    if (USING_EXTERNAL_MODEL && !spawnClearedRef.current && collisionWorldRef?.current) {
      spawnClearedRef.current = true
      const pose = getValidatedSpawnPose(worldLayout, collisionWorldRef.current)
      if (pose && !hasInteractedSinceSpawnRef.current) {
        camera.position.copy(pose.position)
        camera.up.set(0, 1, 0)
        camera.lookAt(pose.target ?? pose.position.clone().add(new THREE.Vector3(0, 0, 5)))
        euler.current.setFromQuaternion(camera.quaternion)
        spawnPositionRef.current = camera.position.clone()
        spawnWorldLayoutRef.current = worldLayout
        if (playerPosRef) {
          playerPosRef.current.x = camera.position.x
          playerPosRef.current.z = camera.position.z
        }
      }
    }

    const { eyeHeight, speed, runMultiplier } = CONFIG.player

    camera.getWorldDirection(_forward)
    _forward.y = 0
    _forward.normalize()
    _right.crossVectors(_forward, camera.up).normalize()

    _move.set(0, 0, 0)
    _move.addScaledVector(_forward, move.current.f - move.current.b)
    _move.addScaledVector(_right, move.current.r - move.current.l)

    if (_move.lengthSq() > 0) {
      const distance = speed * (move.current.run ? runMultiplier : 1) * delta
      _move.normalize().multiplyScalar(distance)

      if (USING_EXTERNAL_MODEL) {
        const steps = Math.max(1, Math.ceil(distance / COLLISION_STEP))
        _step.copy(_move).multiplyScalar(1 / steps)

        for (let index = 0; index < steps; index += 1) {
          camera.position.add(_step)
          resolveExternalCollision(camera, collisionWorldRef, eyeHeight, collisionCapsule.current)
        }
      } else {
        const nextX = camera.position.x + _move.x
        if (!hitsWall(nextX, camera.position.z)) camera.position.x = nextX

        const nextZ = camera.position.z + _move.z
        if (!hitsWall(camera.position.x, nextZ)) camera.position.z = nextZ
      }
    }

    if (!USING_EXTERNAL_MODEL) {
      const halfWidth = CONFIG.hall.width / 2 - 0.9
      const halfDepth = CONFIG.hall.depth / 2 - 0.9
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -halfWidth, halfWidth)
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -halfDepth, halfDepth)
    } else {
      resolveExternalCollision(camera, collisionWorldRef, eyeHeight, collisionCapsule.current)
    }
    camera.position.y = eyeHeight
  })

  return null
}
