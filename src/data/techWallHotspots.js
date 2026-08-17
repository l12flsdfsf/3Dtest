import { RAW_FIGMA_EXPORTS } from './assets.js'

// 技术设备厅墙面热区。本厅版块以合并网格 + 海报背板形式建模（无独立版块节点序列），
// 热区贴模型中的海报背板节点 pCube176。
const TECH_WALL_BASE = {
  hallId: 'tech',
  kind: 'wall',
  color: '#3b82f6',
  fillColor: 'rgba(59, 130, 246, 0.15)',
  borderColor: '#1e40af',
  surfaceDepth: 0.02,
  width: 2.0,
  height: 2.4,
  title: '热点详情',
  scenePreview: RAW_FIGMA_EXPORTS.cPanel3,
  description:
    '本厅汇集摄录、传输、存储、终端等关键设备的代际更迭，直观感受技术对广播影视行业的持续驱动。',
  bullets: ['摄录设备从摄像管到 CMOS 的迭代', '传输从电缆、卫星到光缆与 5G', '终端从专用设备到智能终端'],
}

export const TECH_HALL_WALL_HOTSPOTS = [
  {
    ...TECH_WALL_BASE,
    id: 'tech-wall-poster',
    panelName: 'pCube176',
    code: '技术设备厅 · 设备图录',
    subtitle: '技术设备迭代',
    content:
      '从摄像管摄像机到 CMOS 数字摄录设备，从电缆、卫星传输到光缆与 5G 网络，从专用接收终端到智能终端——设备陈列墙集中呈现广播影视技术装备的代际跨越。',
  },
]
