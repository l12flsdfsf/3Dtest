import { useCallback, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CONFIG } from '../data/config.js'
import { getAutoRoamStartPose } from '../data/autoRoam.js'
import { HALLS, LOCAL_ANCHORS, roomToWorld, MODEL_PLINTH_HALF } from '../data/halls.js'
import {
  COLLISION_STEP,
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

  const applySpawnPose = useCallback(
    (layout) => {
      const { position, target } = getAutoRoamStartPose(layout)

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

  // 地图传送：直接落位并朝向目标（默认朝 +z），同步漫游状态
  const teleportTo = useCallback(
    (position, lookAt) => {
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
    },
    [camera, collisionWorldRef, playerPosRef],
  )

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
      setRoaming(false)
      return
    }

    if (!didInitRef.current) {
      applySpawnPose(worldLayout)
      didInitRef.current = true
    } else if (spawnWorldLayoutRef.current !== worldLayout && !hasInteractedSinceSpawnRef.current) {
      applySpawnPose(worldLayout)
    }
    setRoaming(true)
  }, [active, applySpawnPose, setRoaming, worldLayout])

  useFrame((_, delta) => {
    // 始终同步相机（玩家）世界坐标到 ref，供展厅地图在打开时取一次快照定位「你在此」。
    if (playerPosRef) {
      playerPosRef.current.x = camera.position.x
      playerPosRef.current.z = camera.position.z
    }
    if (!hasInteractedSinceSpawnRef.current && spawnPositionRef.current) {
      const dx = camera.position.x - spawnPositionRef.current.x
      const dz = camera.position.z - spawnPositionRef.current.z
      if (dx * dx + dz * dz > 1.44) {
        hasInteractedSinceSpawnRef.current = true
      }
    }
    if (!active || !roamingRef.current) return

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
