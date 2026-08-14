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
const TRANSIT_SPEED = Math.max(DEFAULT_SPEED * 0.94, 1.55)
const DOC_PANEL_CENTER_X = (LOCAL_ANCHORS.docPanels[0][0] + LOCAL_ANCHORS.docPanels[1][0]) / 2
const DOC_PANEL_CENTER_Y = (LOCAL_ANCHORS.docPanels[0][1] + LOCAL_ANCHORS.docPanels[1][1]) / 2
const DOC_WALL_TARGET = [DOC_PANEL_CENTER_X, DOC_PANEL_CENTER_Y, LOCAL_ANCHORS.docPanels[0][2] - 0.08]
const DOC_WALL_VIEW = [0.2, EYE_Y, 2.8]

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

function corridorTransitPoint(hall, xOffset = 0, zOffset = 0, y = EYE_Y) {
  const { z } = getHallCanonicalCenter(hall)
  const sign = Math.sign(z) || 1
  return [hall.center + xOffset, y, sign * (CORRIDOR_HALF * 0.48 + zOffset)]
}

function buildCorridorTransit(fromHall, toHall) {
  const direction = Math.sign(toHall.center - fromHall.center) || 1
  const gap = Math.abs(toHall.center - fromHall.center)
  const step = Math.min(Math.max(gap * 0.28, 1.25), 1.9)

  return [
    travelFrame(corridorTransitPoint(fromHall, direction * step, 0.12), {
      hold: 0.08,
      lookDistance: 4.9,
    }),
    travelFrame(layoutPoint((fromHall.center + toHall.center) / 2, corridorTransitPoint(fromHall)[2]), {
      lookDistance: 5.1,
    }),
    travelFrame(corridorTransitPoint(toHall, -direction * step, 0.12), {
      hold: 0.08,
      lookDistance: 4.7,
    }),
  ]
}

function buildHallSweep(hall) {
  const themeTarget = hallLook(hall, LOCAL_ANCHORS.themeHotspot)
  const docTarget = hallLook(hall, DOC_WALL_TARGET)
  const modelTarget = hallLook(hall, LOCAL_ANCHORS.modelHotspot)
  const exitTarget = hallwayLook(hall, 0.95)

  return [
    frame(corridorPoint(hall, 0, 1.28), hallwayLook(hall, 2.95), { hold: 0.22, speed: DEFAULT_SPEED }),
    frame(roomPoint(hall, 0.1, 1.85), themeTarget, { hold: 0.4, speed: HALL_SWEEP_SPEED }),
    frame(roomPoint(hall, 1.15, 3.35), themeTarget, { hold: 1.2, speed: HALL_SWEEP_SPEED }),
    frame(roomPoint(hall, DOC_WALL_VIEW[0], DOC_WALL_VIEW[2], DOC_WALL_VIEW[1]), docTarget, {
      hold: 1.45,
      speed: HALL_SWEEP_SPEED,
    }),
    frame(roomPoint(hall, -0.7, 4.2), modelTarget, { hold: 1.05, speed: HALL_SWEEP_SPEED }),
    frame(roomPoint(hall, -0.35, 2.75), exitTarget, { hold: 0.38, speed: HALL_SWEEP_SPEED }),
    travelFrame(corridorPoint(hall, 0, 1.12), { hold: 0.1, lookDistance: 4.55 }),
  ]
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
    ...buildHallSweep(care),
    ...buildCorridorTransit(care, broadcast),
    ...buildHallSweep(broadcast),
    ...buildCorridorTransit(broadcast, tv),
    ...buildHallSweep(tv),
    frame(layoutPoint(-8.95, -0.25), layoutPoint(-11.1, -0.05, 1.65), {
      anchorKey: 'trophyArea',
      hold: 2.35,
      speed: 1.5,
    }),
    travelFrame(layoutPoint(-4.2, -0.1), { hold: 0.08, lookDistance: 5 }),
    travelFrame(layoutPoint(1.8, -0.15), { lookDistance: 5.2 }),
    ...buildHallSweep(cinema),
    ...buildCorridorTransit(cinema, tech),
    ...buildHallSweep(tech),
    ...buildCorridorTransit(tech, future),
    ...buildHallSweep(future),
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

export function buildAutoRoamKeyframes(worldLayout) {
  return buildCanonicalRoute().map((item) => ({
    ...item,
    position: projectPoint(item.position, worldLayout),
    target: item.anchorKey && worldLayout?.anchors?.[item.anchorKey]
      ? new THREE.Vector3(
          worldLayout.anchors[item.anchorKey].x,
          worldLayout.anchors[item.anchorKey].y,
          worldLayout.anchors[item.anchorKey].z,
        )
      : projectPoint(item.target, worldLayout),
  }))
}
