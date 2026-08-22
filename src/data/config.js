// 调试/对比入口：?model=/models/scene.ktx2.glb 可临时切换加载的模型
function resolveModelUrl() {
  if (typeof window !== 'undefined') {
    const override = new URLSearchParams(window.location.search).get('model')
    if (override) return override
  }
  return '/models/site1/scene-site1.glb'
}

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
  modelUrl: resolveModelUrl(),
  // 进门正对大屏（材质名「1屏」的可见面板；其后的「2屏」内容板被它完全遮挡）的视频：
  // 点击播放/暂停，音量随人物距离衰减
  screenVideo: {
    url: '/videos/enter-screen.mp4',
    material: '1屏',
    startTime: 0,
    maxVolume: 0.9,
    fullVolumeDistance: 4, // 距离内满音量
    muteDistance: 18, // 距离外静音
  },
  autoRoam: {
    loop: true,
    speed: 1.7,
    positionSharpness: 6.2,
    targetSharpness: 2.8,
    maxTurnSpeed: 0.62,
    approachTurnStart: 0.18,
    approachTurnEnd: 0.82,
    approachTargetSharpness: 4.6,
    approachMaxTurnSpeed: 0.84,
  },
}
