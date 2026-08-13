import { useCallback, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Capsule } from 'three/examples/jsm/math/Capsule.js'
import { CONFIG } from '../data/config.js'
import { HALLS, LOCAL_ANCHORS, roomToWorld, MODEL_PLINTH_HALF } from '../data/halls.js'

const LOOK_SENSITIVITY = 0.0024
const MAX_PITCH = Math.PI / 2 - 0.05
const PLAYER_RADIUS = 0.35
const COLLISION_STEP = PLAYER_RADIUS * 0.5
const PLAYER_COLLIDER_BOTTOM = PLAYER_RADIUS + 0.02
const PLAYER_HEAD_CLEARANCE = 0.12
const DOOR_HALF = 1.15
const USING_EXTERNAL_MODEL = Boolean(CONFIG.modelUrl)

const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _move = new THREE.Vector3()
const _step = new THREE.Vector3()
const _push = new THREE.Vector3()
const _center = new THREE.Vector2(0, 0)

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
  const collisionWorld = collisionWorldRef?.current
  if (!collisionWorld) return

  collisionCapsule.start.set(camera.position.x, PLAYER_COLLIDER_BOTTOM, camera.position.z)
  collisionCapsule.end.set(camera.position.x, eyeHeight - PLAYER_HEAD_CLEARANCE, camera.position.z)
  const hit = collisionWorld.capsuleIntersect(collisionCapsule)
  if (!hit) return

  _push.copy(hit.normal).multiplyScalar(hit.depth)
  collisionCapsule.translate(_push)
  camera.position.x = collisionCapsule.end.x
  camera.position.z = collisionCapsule.end.z
}

export function Player({ active, onReady, onLockChange, onFocused, markersRef, onSelect, playerPosRef, collisionWorldRef }) {
  const { camera, gl } = useThree()
  const move = useRef({ f: 0, b: 0, l: 0, r: 0, run: false })
  const raycaster = useRef(new THREE.Raycaster())
  const collisionCapsule = useRef(
    new Capsule(
      new THREE.Vector3(0, PLAYER_COLLIDER_BOTTOM, 0),
      new THREE.Vector3(0, CONFIG.player.eyeHeight - PLAYER_HEAD_CLEARANCE, 0),
      PLAYER_RADIUS,
    ),
  )
  const focusedRef = useRef(null)
  const activeRef = useRef(active)
  const didInitRef = useRef(false)
  const roamingRef = useRef(false)
  const draggingRef = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))

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

  useEffect(() => {
    onReady?.({
      lock: () => setRoaming(true),
      unlock: () => setRoaming(false),
    })
  }, [onReady, setRoaming])

  useEffect(() => {
    const setKey = (code, value) => {
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          move.current.f = value ? 1 : 0
          break
        case 'KeyS':
        case 'ArrowDown':
          move.current.b = value ? 1 : 0
          break
        case 'KeyA':
        case 'ArrowLeft':
          move.current.l = value ? 1 : 0
          break
        case 'KeyD':
        case 'ArrowRight':
          move.current.r = value ? 1 : 0
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          move.current.run = value
          break
        case 'KeyE':
          if (value && roamingRef.current && focusedRef.current) onSelect(focusedRef.current)
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
  }, [onSelect, setRoaming])

  useEffect(() => {
    const dom = gl.domElement

    const onContextMenu = (event) => event.preventDefault()
    const onPointerDown = (event) => {
      if (!activeRef.current || event.button !== 2) return
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
      focusedRef.current = null
      onFocused?.(null)
      return
    }

    if (!didInitRef.current) {
      camera.position.set(10, CONFIG.player.eyeHeight, 0)
      camera.lookAt(0, CONFIG.player.eyeHeight, 0)
      euler.current.setFromQuaternion(camera.quaternion)
      didInitRef.current = true
    }
    setRoaming(true)
  }, [active, camera, onFocused, setRoaming])

  useFrame((_, delta) => {
    // 始终同步相机（玩家）世界坐标到 ref，供展厅地图在打开时取一次快照定位「你在此」。
    if (playerPosRef) {
      playerPosRef.current.x = camera.position.x
      playerPosRef.current.z = camera.position.z
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

    raycaster.current.setFromCamera(_center, camera)
    raycaster.current.far = 5.5
    const meshes = markersRef.current.map((entry) => entry.mesh).filter(Boolean)
    const hits = raycaster.current.intersectObjects(meshes, false)
    const focused = hits[0]?.object?.userData?.hotspot ?? null

    if ((focused?.id ?? null) !== (focusedRef.current?.id ?? null)) {
      focusedRef.current = focused
      onFocused?.(focused)
    }
  })

  return null
}
