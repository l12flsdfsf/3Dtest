import { RAW_FIGMA_EXPORTS } from './assets.js'

// 关怀厅三面墙热点数据
const CARE_WALL_BASE = {
  hallId: 'care',
  kind: 'wall',
  color: '#3b82f6',      
  fillColor: 'rgba(59, 130, 246, 0.15)', 
  borderColor: '#1e40af', 
  surfaceDepth: 0.02,     
  title: '热点详情',
  scenePreview: RAW_FIGMA_EXPORTS.cPanel3,
  description:
    '本馆展现行业对人的关怀：从受众的服务承諾，到对从业者与听觉障碍等特殊群体的关注，记录以人为本的初心与温度。',
  bullets: ['以受众为中心的服务理念', '特殊群体的无障碍接收', '从业者权益与职业关怀'],
}

// Care hall 节点名直接来自 scene.gltf（scripts/inspect-scene.cjs）。
// fitToNamedPanel 会用这些名字在场景里找到节点，并按其实际包围盒
// 计算 position/rotation/width/height，避免自动检测把多块面板合并
// 成一个巨大框，也避免不同墙上热点相互重叠。
const CARE_WALL_RIGHT = {
  // 玩家视角右侧墙面（关怀厅入口侧）：4 个面板组成的图组 + 文字小版
  panelNames: [
    '关怀厅010',
    '关怀厅011',
    '关怀厅012',
    '关怀厅013',
    '关怀厅014',
    '关怀厅015',
    '关怀厅016',
    '关怀厅017',
    '关怀厅018',
    '关怀厅019',
  ],
}
const CARE_WALL_BACK = {
  // 进门正对面的后墙：关注厅005/007 两个主面板 + 文字小版
  panelNames: [
    '关怀厅005',
    '关怀厅006',
    '关怀厅007',
    '关怀厅008',
    '关怀厅009',
  ],
}
const CARE_WALL_LEFT = {
  // 玩家视角左侧墙面（关怀厅入口侧对应墙）：关怀厅..关怀厅004 共 5 块 4 张图版块
  panelNames: [
    '关怀厅',
    '关怀厅001',
    '关怀厅002',
    '关怀厅003',
    '关怀厅004',
  ],
}

export const CARE_HALL_WALL_HOTSPOTS = [
  {
    ...CARE_WALL_BASE,
    id: 'care-wall-left',
    wall: 'left',
    ...CARE_WALL_LEFT,
    code: '关怀厅 · 左墙',
    subtitle: '以受众为中心的服务理念',
    content:
      '我们始终坚持"以受众为中心"的服务理念，保障信息无障碍、内容可看可感、沟通平等温馨。通过持续的服务创新与人文关怀，让每一位观众都能感受到温暖与尊重。',
  },
  {
    ...CARE_WALL_BASE,
    id: 'care-wall-back',
    wall: 'back',
    ...CARE_WALL_BACK,
    code: '关怀厅 · 背墙',
    subtitle: '特殊群体的无障碍接收',
    content:
      '重点关注老年、视觉障碍等特殊群体的接收需求与从业保障。通过技术创新与服务升级，消除信息隔阂，让每个人都能平等享有优质内容。',
  },
  {
    ...CARE_WALL_BASE,
    id: 'care-wall-right',
    wall: 'right',
    ...CARE_WALL_RIGHT,
    code: '关怀厅 · 右墙',
    subtitle: '从业者权益与职业关怀',
    content:
      '保障从业者合法权益，建立完善的职业发展通道与关怀机制。通过技能培训、健康保障与心理支持，为从业者营造良好的工作环境与发展空间。',
  },
]






