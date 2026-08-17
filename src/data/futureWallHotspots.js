import { RAW_FIGMA_EXPORTS } from './assets.js'

// 展望厅墙面热区（行业发展与未来展望）。
const FUTURE_WALL_BASE = {
  hallId: 'future',
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
    '本厅展望媒体融合、智慧广电与国际化传播的未来图景，呈现 5G、超高清、人工智能、虚拟现实等新技术在广电领域的应用趋势。',
  bullets: ['媒体融合 · 智慧广电 · 国际传播', '5G · 超高清 · 人工智能', '虚拟现实 · 区块链等新技术应用'],
}

export const FUTURE_HALL_WALL_HOTSPOTS = [
  {
    ...FUTURE_WALL_BASE,
    id: 'future-wall-fusion',
    panelNames: ['展望厅', '展望厅001', '展望厅002', '展望厅003'],
    code: '展望厅 · 融合与传播',
    subtitle: '媒体融合与国际传播',
    content:
      '聚焦媒体融合发展战略与智慧广电建设，讲述主流媒体如何向全媒体转型；同时展望国际传播能力建设，讲好中国故事、传播好中国声音。',
  },
  {
    ...FUTURE_WALL_BASE,
    id: 'future-wall-tech',
    panelNames: ['展望厅004', '展望厅005', '展望厅006', '展望厅007', '展望厅008', '展望厅009', '展望厅010', '展望厅011'],
    code: '展望厅 · 新技术趋势',
    subtitle: '5G · 超高清 · 人工智能',
    content:
      '从 5G 应用、超高清制播到人工智能辅助生产，这条展线呈现新一代信息技术与广电深度融合的趋势，勾勒智慧化、高清化、移动化的未来传播形态。',
  },
  {
    ...FUTURE_WALL_BASE,
    id: 'future-wall-frontier',
    panelNames: ['展望厅012', '展望厅013', '展望厅014', '展望厅015'],
    code: '展望厅 · 前沿应用',
    subtitle: '虚拟现实与区块链媒体',
    content:
      '虚拟现实带来沉浸式视听体验，区块链技术助力内容版权保护与可信传播——前沿技术持续拓展广电行业的边界，未来传播充满想象空间。',
  },
]
