import { RAW_FIGMA_EXPORTS } from './assets.js'

// 电影厅墙面热区（甘肃省广播电影电视发展史 · 电影篇）。
const CINEMA_WALL_BASE = {
  hallId: 'cinema',
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
    '本厅呈现甘肃电影产业从制片创作、发行放映到城乡影院建设的发展历程，展示电影设备迭代与服务体系的完善。',
  bullets: ['电影制片厂 · 电影创作生产', '发行放映 · 农村电影放映 · 影院建设', '电影设备与技术演进'],
}

export const CINEMA_HALL_WALL_HOTSPOTS = [
  {
    ...CINEMA_WALL_BASE,
    id: 'cinema-wall-production',
    panelNames: ['电影厅', '电影厅001', '电影厅002', '电影厅003', '电影厅004'],
    code: '电影厅 · 制片与放映',
    subtitle: '电影制片与发行放映',
    content:
      '从电影制片厂的创建与创作生产，到电影发行放映体系的形成，这面墙记录了甘肃电影从无到有、从小到大的发展足迹，以及一代代电影人的耕耘与奉献。',
  },
  {
    ...CINEMA_WALL_BASE,
    id: 'cinema-wall-screening',
    panelNames: ['电影厅005', '电影厅006', '电影厅007', '电影厅008', '电影厅009'],
    code: '电影厅 · 放映与影院',
    subtitle: '农村放映与城市影院',
    content:
      '从送电影下乡的农村流动放映，到城市影院的建设升级，电影公共服务与市场体系双轮驱动，让光影艺术走进城乡千家万户，不断满足群众的精神文化需求。',
  },
  {
    ...CINEMA_WALL_BASE,
    id: 'cinema-wall-equipment',
    panelNames: ['电影厅010', '电影厅011', '电影厅012', '电影厅013'],
    code: '电影厅 · 电影设备',
    subtitle: '电影设备与技术',
    content:
      '集中展示放映机、摄影机等电影设备实物与图录，见证从胶片放映到数字放映的技术演进，直观感受设备迭代为电影产业带来的深刻变革。',
  },
]
