import { RAW_FIGMA_EXPORTS } from './assets.js'

// 广播厅墙面热区（甘肃省广播电影电视发展史 · 广播篇）。
// - panelName / panelNames: 模型中的版块节点名，外部模型模式下由 fitToNamedPanel 贴合：
//   单块版按其包围盒贴合；panelNames 传整面墙的全部版块，用一个蓝框框住全部海报。
// - 正对入口的 -x 墙单独框「新闻节目」版；左右两侧墙各用一个整墙大框。
const BROADCAST_WALL_BASE = {
  hallId: 'broadcast',
  kind: 'wall',
  color: '#3b82f6',      // 蓝色边框
  fillColor: 'rgba(59, 130, 246, 0.15)',
  borderColor: '#1e40af', // 深蓝色边框
  surfaceDepth: 0.02,
  width: 2.0,
  height: 2.4,
  title: '热点详情',
  scenePreview: RAW_FIGMA_EXPORTS.cPanel3,
  description:
    '本厅呈现甘肃省广播电影电视发展史广播篇，梳理从有线广播、调频调幅到数字化、网络化的发展脉络，见证声音传播的百年跨越与覆盖升级。',
  bullets: ['甘肃省广播电影电视发展史 · 广播篇', '新闻节目 · 都市调频 · 对农广播', '中波 · 调频 · 制播 · 村村通 · 通联'],
}

export const BROADCAST_HALL_WALL_HOTSPOTS = [
  {
    ...BROADCAST_WALL_BASE,
    id: 'broadcast-panel-news',
    panelName: '广播厅004',
    wall: 'back',
    code: '广播厅 · 新闻节目',
    subtitle: '新闻节目',
    content:
      '新闻宣传是党赋予广播事业的重要而神圣的职责，新闻节目是广播电台的骨干和主体。甘肃人民广播电台建台以来，始终以新闻立台，围绕党和政府的中心工作，及时传递党的声音，忠实记录时代发展。',
  },
  {
    ...BROADCAST_WALL_BASE,
    id: 'broadcast-panel-cityfm-rural',
    panelNames: ['广播厅008', '广播厅015', '广播厅016', '广播厅017', '广播厅018'],
    wall: 'left',
    code: '广播厅 · 都市调频与对农广播',
    subtitle: '都市调频 · 对农广播',
    content:
      '从甘肃人民广播电台都市调频面向城市听众的生活服务节目，到面向广大农村的对农广播系列，广播频率分工日益精细：都市调频贴近城市生活，对农广播服务乡村发展，把党的声音与实用信息送到城乡千家万户。',
  },
  {
    ...BROADCAST_WALL_BASE,
    id: 'broadcast-panel-network',
    panelNames: ['广播厅009', '广播厅010', '广播厅011', '广播厅012', '广播厅013'],
    wall: 'right',
    code: '广播厅 · 制播与覆盖',
    subtitle: '广播制播与覆盖',
    content:
      '从中波广播发射、调频广播到广播节目制作与播出，再到有线广播与村村通工程、通联与听众工作，这条展线呈现了广播从发射传输、内容制播到覆盖服务的完整链条，见证广播事业服务大众的初心。',
  },
]
