export const CONFIG = {
  hall: {
    width: 24,
    depth: 24,
    height: 6.6,
    wallThickness: 0.24,
    corridorHalf: 4.8,
    centralStage: {
      footprintX: 1.02,
      footprintZ: 5.12,
      plinthHeight: 0.22,
      screenSpan: 4.8,
      screenHeight: 2.7,
      screenThickness: 0.11,
    },
    sandTable: {
      centerX: -6.1,
      centerZ: 0,
      sizeX: 4.6,
      sizeZ: 2.4,
      height: 0.84,
    },
  },
  player: {
    eyeHeight: 1.72,
    speed: 5.2,
    runMultiplier: 1.75,
  },
  modelUrl: '/models/scene.gltf',
  autoRoam: {
    loop: true,
    speed: 1.7,
    positionSharpness: 6.2,
    targetSharpness: 2.8,
    maxTurnSpeed: 0.72,
  },
}
