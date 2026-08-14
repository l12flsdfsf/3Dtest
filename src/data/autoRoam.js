import * as THREE from 'three'
import { CONFIG } from './config.js'
import {
  HALLS,
  LOCAL_ANCHORS,
  getHallCanonicalCenter,
  projectHallLayoutToWorldPosition,
  roomToHallLayoutPosition,
} from './halls.js'

const EYE_Y = CONFIG.player.eyeHeight
const CORRIDOR_HALF = CONFIG.hall.corridorHalf ?? 4
const DEFAULT_SPEED = CONFIG.autoRoam.speed ?? 1.7
const HALL_SWEEP_SPEED = Math.max(DEFAULT_SPEED * 0.88, 1.45)
const HALL_FOCUS_SPEED = Math.max(DEFAULT_SPEED * 0.72, 1.18)
const TRANSIT_SPEED = Math.max(DEFAULT_SPEED * 0.94, 1.55)
const DOC_PANEL_CENTER_X = (LOCAL_ANCHORS.docPanels[0][0] + LOCAL_ANCHORS.docPanels[1][0]) / 2
const DOC_PANEL_CENTER_Y = (LOCAL_ANCHORS.docPanels[0][1] + LOCAL_ANCHORS.docPanels[1][1]) / 2
const DOC_WALL_TARGET = [DOC_PANEL_CENTER_X, DOC_PANEL_CENTER_Y, LOCAL_ANCHORS.docPanels[0][2] - 0.08]
const DOC_WALL_VIEW = [0.2, EYE_Y, 2.8]
const CORRIDOR_TRANSIT_DEPTH = 1.55
const ENTRY_SIDE_OFFSET = 0.42
const EXIT_SIDE_OFFSET = 0.52
const ENTRY_PRETURN_OFFSET = 0.78

const HALL_BY_ID = Object.fromEntries(HALLS.map((hall) => [hall.id, hall]))

function layoutPoint(x, z, y = EYE_Y) {
  return [x, y, z]
}

function projectPoint([x, y, z], worldLayout) {
  const projected = projectHallLayoutToWorldPosition(x, z, worldLayout)
  return new THREE.Vector3(projected.x, y, projected.z)
}

function corridorPoint(hall, xOffset = 0, depth = 0.92, y = EYE_Y) {
  const { z } = getHallCanonicalCenter(hall)
  return [hall.center + xOffset, y, z > 0 ? CORRIDOR_HALF - depth : -CORRIDOR_HALF + depth]
}

function roomPoint(hall, localX, localZ, y = EYE_Y) {
  return roomToHallLayoutPosition(hall, [localX, y, localZ])
}

function hallLook(hall, anchor) {
  return roomToHallLayoutPosition(hall, anchor)
}

function hallwayLook(hall, depth = 2.15, y = EYE_Y + 0.08) {
  const { z } = getHallCanonicalCenter(hall)
  return [hall.center, y, z > 0 ? CORRIDOR_HALF + depth : -CORRIDOR_HALF - depth]
}

function frame(position, target, options = {}) {
  return {
    position,
    target,
    hold: 0,
    speed: DEFAULT_SPEED,
    anchorKey: null,
    targetMode: 'fixed',
    lookDistance: 4.2,
    ...options,
  }
}

function travelFrame(position, options = {}) {
  return frame(position, position, {
    targetMode: 'forward',
    lookDistance: 4.8,
    hold: 0,
    speed: TRANSIT_SPEED,
    ...options,
  })
}

function buildCorridorTransit(fromHall, toHall) {
  const direction = Math.sign(toHall.center - fromHall.center) || 0
  const rowSign = Math.sign(getHallCanonicalCenter(fromHall).z) || 1
  const midpointX = fromHall.center + (toHall.center - fromHall.center) * 0.52
  const transitZ = rowSign * (CORRIDOR_HALF - CORRIDOR_TRANSIT_DEPTH)

  if (!direction) return []

  return [
    travelFrame(layoutPoint(midpointX, transitZ), {
      hold: 0,
      lookDistance: 4.75,
      speed: TRANSIT_SPEED * 0.97,
    }),
    travelFrame(corridorPoint(toHall, -direction * ENTRY_PRETURN_OFFSET, CORRIDOR_TRANSIT_DEPTH), {
      hold: 0,
      lookDistance: 4.6,
      speed: TRANSIT_SPEED * 0.97,
    }),
  ]
}

function buildHallSweep(hall, { entryDirection = 0, exitDirection = 0, entryTargetOverride = null } = {}) {
  const themeTarget = hallLook(hall, LOCAL_ANCHORS.themeHotspot)
  const docTarget = hallLook(hall, DOC_WALL_TARGET)
  const modelTarget = hallLook(hall, LOCAL_ANCHORS.modelHotspot)
  const entryTarget = entryTargetOverride ?? (entryDirection ? themeTarget : hallwayLook(hall, 2.95))
  const entryOffset = entryDirection ? -entryDirection * ENTRY_SIDE_OFFSET : 0
  const exitOffset = exitDirection ? exitDirection * EXIT_SIDE_OFFSET : 0
  const exitRoomPosition = roomPoint(hall, exitDirection ? -0.18 + exitDirection * 0.24 : -0.35, 2.68)
  const exitTarget = exitDirection
    ? corridorPoint(hall, exitDirection * 1.8, CORRIDOR_TRANSIT_DEPTH, EYE_Y + 0.08)
    : hallwayLook(hall, 0.95)
  const exitFrames = exitDirection
    ? [
        travelFrame(exitRoomPosition, {
          hold: 0.03,
          lookDistance: 4.3,
          speed: HALL_SWEEP_SPEED * 0.98,
        }),
        travelFrame(corridorPoint(hall, exitOffset, 1.16), {
          hold: 0.04,
          lookDistance: 4.55,
          speed: TRANSIT_SPEED * 0.95,
        }),
      ]
    : [
        frame(exitRoomPosition, exitTarget, { hold: 0.14, speed: HALL_SWEEP_SPEED * 0.96 }),
        travelFrame(corridorPoint(hall, exitOffset, 1.16), {
          hold: 0.04,
          lookDistance: 4.55,
          speed: TRANSIT_SPEED * 0.95,
        }),
      ]

  return [
    frame(corridorPoint(hall, entryOffset, 1.24), entryTarget, {
      hold: 0.04,
      speed: DEFAULT_SPEED * 0.96,
    }),
    frame(roomPoint(hall, 0.1, 1.85), themeTarget, { hold: 0.4, speed: HALL_SWEEP_SPEED }),
    frame(roomPoint(hall, 1.15, 3.35), themeTarget, { hold: 1.2, speed: HALL_SWEEP_SPEED }),
    frame(roomPoint(hall, DOC_WALL_VIEW[0], DOC_WALL_VIEW[2], DOC_WALL_VIEW[1]), docTarget, {
      hold: 2.05,
      speed: HALL_FOCUS_SPEED,
    }),
    frame(roomPoint(hall, -0.7, 4.2), modelTarget, { hold: 1.7, speed: HALL_FOCUS_SPEED }),
    ...exitFrames,
  ]
}

function buildTvToCinemaTransition() {
  return [
    frame(layoutPoint(-8.95, -0.3), layoutPoint(-11.15, 0.2, 1.65), {
      hold: 1.05,
      speed: 1.38,
    }),
    frame(layoutPoint(-8.92, 0.72), layoutPoint(-10.95, 1.05, 1.65), {
      hold: 0.1,
      speed: 1.34,
    }),
    frame(layoutPoint(-8.68, 2.15), layoutPoint(-9.55, 4.05), {
      hold: 0.02,
      speed: 1.42,
    }),
  ]
}

function resolveFrameTargetPoint(item, worldLayout) {
  if (item.anchorKey && worldLayout?.anchors?.[item.anchorKey]) {
    return new THREE.Vector3(
      worldLayout.anchors[item.anchorKey].x,
      worldLayout.anchors[item.anchorKey].y,
      worldLayout.anchors[item.anchorKey].z,
    )
  }

  return projectPoint(item.target, worldLayout)
}

function buildCanonicalRoute() {
  const care = HALL_BY_ID.care
  const broadcast = HALL_BY_ID.broadcast
  const tv = HALL_BY_ID.tv
  const cinema = HALL_BY_ID.cinema
  const tech = HALL_BY_ID.tech
  const future = HALL_BY_ID.future

  const firstRowSign = Math.sign(getHallCanonicalCenter(care).z) || -1
  const secondRowSign = Math.sign(getHallCanonicalCenter(future).z) || 1

  return [
    frame(layoutPoint(11.35, 0.02), layoutPoint(7.8, 0), { hold: 1.35, speed: 1.45 }),
    frame(layoutPoint(9.62, 2.76 * firstRowSign), layoutPoint(10.96, 5.78 * firstRowSign, 2.22), {
      hold: 2.7,
      speed: 1.35,
    }),
    frame(layoutPoint(8.55, 0.95 * firstRowSign), layoutPoint(7.95, 2.15 * firstRowSign), {
      hold: 0.3,
      speed: 1.5,
    }),
    ...buildHallSweep(care, { exitDirection: Math.sign(broadcast.center - care.center) || 0 }),
    ...buildCorridorTransit(care, broadcast),
    ...buildHallSweep(broadcast, {
      entryDirection: Math.sign(broadcast.center - care.center) || 0,
      exitDirection: Math.sign(tv.center - broadcast.center) || 0,
    }),
    ...buildCorridorTransit(broadcast, tv),
    ...buildHallSweep(tv, { entryDirection: Math.sign(tv.center - broadcast.center) || 0 }),
    ...buildTvToCinemaTransition(),
    ...buildHallSweep(cinema, {
      entryDirection: 1,
      entryTargetOverride: hallwayLook(cinema, 2.95),
      exitDirection: Math.sign(tech.center - cinema.center) || 0,
    }),
    ...buildCorridorTransit(cinema, tech),
    ...buildHallSweep(tech, {
      entryDirection: Math.sign(tech.center - cinema.center) || 0,
      exitDirection: Math.sign(future.center - tech.center) || 0,
    }),
    ...buildCorridorTransit(tech, future),
    ...buildHallSweep(future, { entryDirection: Math.sign(future.center - tech.center) || 0 }),
    frame(layoutPoint(8.55, 2.2 * secondRowSign), layoutPoint(11.55, 3.75 * secondRowSign, 2.15), {
      anchorKey: 'honorChapter',
      hold: 2.5,
      speed: 1.45,
    }),
    frame(layoutPoint(9.1, 0.95 * secondRowSign), layoutPoint(8.1, 1.55 * secondRowSign), {
      hold: 0.28,
      speed: 1.45,
    }),
    frame(layoutPoint(11.35, 0.02), layoutPoint(7.75, 0), { hold: 1.55, speed: 1.4 }),
  ]
}

export function getAutoRoamStartPose(worldLayout) {
  const [startFrame] = buildCanonicalRoute()

  return {
    position: projectPoint(startFrame.position, worldLayout),
    target: resolveFrameTargetPoint(startFrame, worldLayout),
  }
}

export function buildAutoRoamKeyframes(worldLayout) {
  return buildCanonicalRoute().map((item) => ({
    ...item,
    position: projectPoint(item.position, worldLayout),
    target: resolveFrameTargetPoint(item, worldLayout),
  }))
}
