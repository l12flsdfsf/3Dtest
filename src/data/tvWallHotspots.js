import { RAW_FIGMA_EXPORTS } from './assets.js'

// 电视厅墙面热区（甘肃省广播电影电视发展史 · 电视篇）。
// panelNames 按模型中的版块节点名分组，fitToNamedPanel 用一个蓝框框住整面墙的全部海报。
const TV_WALL_BASE = {
  hallId: 'tv',
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
    '本厅呈现甘肃电视从黑白到彩色、从模拟到高清超高清的发展历程，展示制播体系升级、传输覆盖扩展与融媒体转型的完整脉络。',
  bullets: ['黑白—彩色—有线—卫星—数字—高清—融媒体', '电视节目制作与播出', '传输覆盖与经营管理'],
}

export const TV_HALL_WALL_HOTSPOTS = [
  {
    ...TV_WALL_BASE,
    id: 'tv-wall-history',
    panelNames: [
      '电视厅001', '电视厅002', '电视厅003', '电视厅004', '电视厅005', '电视厅006',
      '电视厅007', '电视厅008', '电视厅009', '电视厅010', '电视厅011', '电视厅012',
    ],
    code: '电视厅 · 发展历程',
    subtitle: '甘肃电视发展历程',
    content:
      '从黑白电视、彩色电视时期起步，历经有线电视、卫星电视的覆盖扩展，再到数字电视、高清电视的画质跃迁，直至今天的融媒体时代——这条长墙完整梳理了甘肃电视事业的发展轨迹与技术代际更迭。',
  },
  {
    ...TV_WALL_BASE,
    id: 'tv-wall-era',
    panelNames: ['电视厅', '电视厅014', '电视厅015', '电视厅016', '电视厅017', '电视厅018'],
    code: '电视厅 · 电视时期',
    subtitle: '从黑白到数字的电视时期',
    content:
      '以时间为轴回顾甘肃电视各个时期的代表画面：黑白时期的开创艰辛、彩色时期的丰富呈现、有线与卫星时期的覆盖扩大、数字时期的技术升级，唤起几代观众的荧屏记忆。',
  },
  {
    ...TV_WALL_BASE,
    id: 'tv-wall-production',
    panelNames: ['电视厅013', '电视厅019', '电视厅020', '电视厅021', '电视厅022', '电视厅023'],
    code: '电视厅 · 制播与覆盖',
    subtitle: '电视制播与传输覆盖',
    content:
      '聚焦电视节目制作、播出与传输覆盖体系：从摄录编播全流程数字化，到无线、有线、卫星多渠道覆盖，再到经营管理与技术队伍建设，展现电视事业运转的完整链条。',
  },
]
