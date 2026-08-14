import { CONFIG } from './config.js'
import { RAW_FIGMA_EXPORTS } from './assets.js'

// 房间几何（与 Hall.jsx / Player.jsx 保持一致）
const CORRIDOR_HALF = CONFIG.hall.corridorHalf ?? 4
const ROOM_WIDTH = CONFIG.hall.width / 3
const ROOM_DEPTH = CONFIG.hall.depth / 2 - CORRIDOR_HALF
const ROOM_HALF_X = ROOM_WIDTH / 2
const ROOM_CENTER_Z = CORRIDOR_HALF + ROOM_DEPTH / 2
const USING_EXTERNAL_MODEL = Boolean(CONFIG.modelUrl)
const CORRIDOR_HALL = { id: 'corridor', label: '中央走廊' }
const ENTRANCE_HALL = { id: 'entrance', label: '主入口' }

// 房间内本地坐标锚点：入口在 z=0（朝向中央走廊），后墙在 z=ROOM_DEPTH。
// “进门右边”取本地 -x 侧墙——前厅朝 +z、后厅朝 -z 进入时，玩家右手方向均为本地 -x。
// 该坐标在 Room 组内直接使用（组已处理前/后墙的旋转），热点位置由 roomToWorld 投影到世界坐标。
export const LOCAL_ANCHORS = {
  theme: [-ROOM_HALF_X + 0.55, 2.15, 1.85], // 主题展板中心：靠近 -x 墙（进门右侧），离墙留间隙
  themeHotspot: [-ROOM_HALF_X + 1.15, 2.15, 1.85], // 主题热点：浮在展板前方（室内侧），避免穿墙
  themeSize: [1.92, 2.72], // (沿 z 的宽, 沿 y 的高)
  docPanels: [
    [-1.78, 2.12, ROOM_DEPTH - 0.22],
    [1.78, 2.12, ROOM_DEPTH - 0.22],
  ],
  docSize: [2.5, 2.2], // (沿 x 的宽, 沿 y 的高)
  docHotspot: [0, 2.12, ROOM_DEPTH - 0.95], // 文献热点：两块展板之间、离后墙留间隙
  model: [1.45, 0, 4.4], // 实物模型展台中心（底面）
  modelHotspot: [1.45, 1.35, 4.4],
}

// 展台碰撞半边长（Player.jsx 用）
export const MODEL_PLINTH_HALF = 0.62

// 本地坐标 -> 世界坐标。需与 Hall.jsx 中 Room 组的变换一致：
// 前厅 position=[center,0,+corridorHalf] rotationY=0；后厅 position=[center,0,-corridorHalf] rotationY=π。
export function roomToWorld(hall, [lx, ly, lz]) {
  if (hall.wall === 'front') return [hall.center + lx, ly, CORRIDOR_HALF + lz]
  return [hall.center - lx, ly, -CORRIDOR_HALF - lz]
}

export function getHallWorldWall(hall) {
  if (!USING_EXTERNAL_MODEL) return hall.wall
  return hall.wall === 'front' ? 'back' : 'front'
}

export function getHallCanonicalCenter(hall) {
  return {
    x: hall.center,
    z: getHallWorldWall(hall) === 'front' ? ROOM_CENTER_Z : -ROOM_CENTER_Z,
  }
}

function applyLayoutTransform(x, z, transform) {
  const xCoefficients = transform?.x
  const zCoefficients = transform?.z

  if (
    !Array.isArray(xCoefficients) ||
    xCoefficients.length !== 3 ||
    !Array.isArray(zCoefficients) ||
    zCoefficients.length !== 3
  ) {
    return null
  }

  return {
    x: xCoefficients[0] * x + xCoefficients[1] * z + xCoefficients[2],
    z: zCoefficients[0] * x + zCoefficients[1] * z + zCoefficients[2],
  }
}

export function normalizeWorldPositionToHallLayout(x, z, worldLayout) {
  const transformed = applyLayoutTransform(x, z, worldLayout?.transform)
  if (transformed) return transformed

  if (!worldLayout) return { x, z }

  const baseHalfWidth = CONFIG.hall.width / 2
  const baseHalfDepth = CONFIG.hall.depth / 2
  const sourceHalfWidth = worldLayout.halfWidth || baseHalfWidth
  const sourceHalfDepth = worldLayout.halfDepth || baseHalfDepth
  const centerX = worldLayout.centerX ?? 0
  const centerZ = worldLayout.centerZ ?? 0

  return {
    x: ((x - centerX) * baseHalfWidth) / sourceHalfWidth,
    z: ((z - centerZ) * baseHalfDepth) / sourceHalfDepth,
  }
}

function hallFromWorldBounds(x, z, worldLayout) {
  const boundPadding = 0.85
  const matchedHall = (worldLayout?.halls ?? [])
    .map((layoutHall) => {
      const hall = HALLS.find((item) => item.id === layoutHall.id)
      if (!hall) return null

      const minX = layoutHall.worldMinX
      const maxX = layoutHall.worldMaxX
      const minZ = layoutHall.worldMinZ
      const maxZ = layoutHall.worldMaxZ

      if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null
      if (
        x < minX - boundPadding ||
        x > maxX + boundPadding ||
        z < minZ - boundPadding ||
        z > maxZ + boundPadding
      ) {
        return null
      }

      const halfX = Math.max((maxX - minX) / 2, 0.001)
      const halfZ = Math.max((maxZ - minZ) / 2, 0.001)
      const dx = Math.abs(x - (minX + maxX) / 2)
      const dz = Math.abs(z - (minZ + maxZ) / 2)

      return {
        hall,
        score: Math.max(dx / (halfX + boundPadding), dz / (halfZ + boundPadding)),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)[0]

  return matchedHall ? { id: matchedHall.hall.id, label: matchedHall.hall.name } : null
}

export function hallAtWorldPosition(x, z, worldLayout) {
  const matchedHall = hallFromWorldBounds(x, z, worldLayout)
  if (matchedHall) return matchedHall

  const corridorHalf = CONFIG.hall.corridorHalf ?? 4
  const halfWidth = CONFIG.hall.width / 2
  const roomHalf = CONFIG.hall.width / 6
  const hallTolerance = 0.6
  const normalized = normalizeWorldPositionToHallLayout(x, z, worldLayout)

  if (normalized.x > halfWidth - 1 && Math.abs(normalized.z) < 3) {
    return ENTRANCE_HALL
  }

  if (Math.abs(normalized.z) <= corridorHalf) {
    return CORRIDOR_HALL
  }

  const worldWall = normalized.z > 0 ? 'front' : 'back'
  const mappedHalls = worldLayout?.halls?.length
    ? worldLayout.halls
        .map((layoutHall) => {
          const hall = HALLS.find((item) => item.id === layoutHall.id)
          if (!hall) return null
          return {
            hall,
            centerX: layoutHall.x,
            worldWall: layoutHall.z >= 0 ? 'front' : 'back',
          }
        })
        .filter(Boolean)
    : HALLS.map((hall) => ({
        hall,
        centerX: hall.center,
        worldWall: getHallWorldWall(hall),
      }))

  const nearest = mappedHalls
    .filter((item) => item.worldWall === worldWall)
    .map((item) => ({ hall: item.hall, delta: Math.abs(normalized.x - item.centerX) }))
    .sort((a, b) => a.delta - b.delta)[0]

  if (!nearest || nearest.delta > roomHalf + hallTolerance) {
    return CORRIDOR_HALL
  }

  return { id: nearest.hall.id, label: nearest.hall.name }
}

// 由玩家世界坐标判断当前所处区域（分厅 / 中央走廊 / 主入口），供展厅地图标记当前位置。
export function hallAtPosition(x, z) {
  const corridorHalf = CONFIG.hall.corridorHalf ?? 4
  const halfWidth = CONFIG.hall.width / 2
  const roomHalf = CONFIG.hall.width / 6

  if (x > halfWidth - 1 && Math.abs(z) < 3) return ENTRANCE_HALL
  if (Math.abs(z) <= corridorHalf) return CORRIDOR_HALL

  const wall = z > 0 ? 'front' : 'back'
  const hall = HALLS.find((h) => h.wall === wall && Math.abs(x - h.center) <= roomHalf)
  return hall ? { id: hall.id, label: hall.name } : CORRIDOR_HALL
}

// 六大篇章展厅。image 复用现有 Figma 导出作为抽屉预览占位图。
const W = CONFIG.hall.width
export const HALLS = [
  {
    id: 'care',
    name: '关怀厅',
    wall: 'front',
    center: W / 3,
    color: '#4b5563',
    chapter: '人文关怀',
    image: RAW_FIGMA_EXPORTS.detailScene,
    theme: {
      title: '人文关怀',
      body: '本厅呈现行业对人的关怀：从受众的服务承诺，到对从业者与视听障碍等特殊群体的关注，记录以人为本的初心与温度。',
    },
    highlights: ['以受众为中心的服务理念', '特殊群体的无障碍接收', '从业者权益与职业关怀'],
    docs: [
      { title: '服务理念', body: '以受众为中心，保障信息触达、内容可靠与无障碍传播。' },
      { title: '群体关怀', body: '关注老年、视听障碍等群体的接收需求与从业保障。' },
    ],
    model: { name: '实物模型', body: '实物模型展台（占位），后续可替换为真实展品。' },
    facts: [
      { label: '篇章', value: '一 · 人文关怀' },
      { label: '关键词', value: '以人为本 · 服务' },
      { label: '展项', value: '展板 / 文献 / 模型' },
    ],
  },
  {
    id: 'broadcast',
    name: '广播厅',
    wall: 'front',
    center: 0,
    color: '#4b5563',
    chapter: '广播发展',
    image: RAW_FIGMA_EXPORTS.videoScene,
    theme: {
      title: '广播发展',
      body: '梳理广播从有线广播、调频调幅到数字化、网络化的发展脉络，见证声音传播的百年跨越与覆盖升级。',
    },
    highlights: ['电子管到数字音频的技术演进', '从村头喇叭到调频同步覆盖', '网络音频与移动收听的新形态'],
    docs: [
      { title: '技术演进', body: '电子管—晶体管—集成电路—数字音频广播的代际更迭。' },
      { title: '覆盖历程', body: '从村头喇叭到调频同步覆盖与网络直播的扩展。' },
    ],
    model: { name: '实物模型', body: '实物模型展台（占位），后续可替换为真实展品。' },
    facts: [
      { label: '篇章', value: '二 · 广播发展' },
      { label: '关键词', value: '声音 · 覆盖' },
      { label: '展项', value: '展板 / 文献 / 模型' },
    ],
  },
  {
    id: 'tv',
    name: '电视厅',
    wall: 'front',
    center: -W / 3,
    color: '#4b5563',
    chapter: '电视行业',
    image: RAW_FIGMA_EXPORTS.cPanel1,
    theme: {
      title: '电视行业',
      body: '回顾电视从黑白到彩色、从模拟到高清与超高清的行业进程，展示制播体系升级与节目形态的变迁。',
    },
    highlights: ['黑白—彩色—高清—超高清的画质跃迁', '摄录编播全流程的数字化', '新闻、综艺与融媒体节目演进'],
    docs: [
      { title: '制播体系', body: '摄录、剪辑、播出、传输全流程的数字化升级。' },
      { title: '节目形态', body: '新闻、综艺、纪录片及融媒体产品的形态演进。' },
    ],
    model: { name: '实物模型', body: '实物模型展台（占位），后续可替换为真实展品。' },
    facts: [
      { label: '篇章', value: '三 · 电视行业' },
      { label: '关键词', value: '制播 · 高清化' },
      { label: '展项', value: '展板 / 文献 / 模型' },
    ],
  },
  {
    id: 'cinema',
    name: '电影厅',
    wall: 'back',
    center: -W / 3,
    color: '#4b5563',
    chapter: '电影产业',
    image: RAW_FIGMA_EXPORTS.cPanel2,
    theme: {
      title: '电影产业',
      body: '呈现电影产业从胶片到数字、从院线到多窗口发行的发展，聚焦创作生产、技术革新与市场体系。',
    },
    highlights: ['胶片到数字的摄制技术革新', '创作、制片与发行的全链条', '院线、影城与多窗口发行体系'],
    docs: [
      { title: '创作生产', body: '从剧本、拍摄到后期、合成的创作与制片流程。' },
      { title: '发行放映', body: '院线、影城与多窗口（影院/网络/电视）发行体系。' },
    ],
    model: { name: '实物模型', body: '实物模型展台（占位），后续可替换为真实展品。' },
    facts: [
      { label: '篇章', value: '四 · 电影产业' },
      { label: '关键词', value: '创作 · 院线' },
      { label: '展项', value: '展板 / 文献 / 模型' },
    ],
  },
  {
    id: 'tech',
    name: '技术设备厅',
    wall: 'back',
    center: 0,
    color: '#4b5563',
    chapter: '技术设备迭代',
    image: RAW_FIGMA_EXPORTS.modelScene,
    theme: {
      title: '技术设备迭代',
      body: '汇集摄录、传输、存储、终端等关键设备的代际更迭，直观感受技术对行业的持续驱动。',
    },
    highlights: ['摄录设备从摄像管到 CMOS 的迭代', '传输从电缆、卫星到光缆与 5G', '终端从专用设备到智能终端的演进'],
    docs: [
      { title: '摄录设备', body: '从摄像管到 CMOS、从磁带到文件化的迭代。' },
      { title: '传输终端', body: '电缆、卫星、光缆到 5G 与智能终端的演进。' },
    ],
    model: { name: '实物模型', body: '实物模型展台（占位），后续可替换为真实展品。' },
    facts: [
      { label: '篇章', value: '五 · 技术设备迭代' },
      { label: '关键词', value: '设备 · 代际' },
      { label: '展项', value: '展板 / 文献 / 模型' },
    ],
  },
  {
    id: 'future',
    name: '展望厅',
    wall: 'back',
    center: W / 3,
    color: '#4b5563',
    chapter: '行业管理与未来发展展望',
    image: RAW_FIGMA_EXPORTS.cPanel3,
    theme: {
      title: '管理与展望',
      body: '梳理行业管理历程与政策框架，并展望媒体融合、智能化、国际化背景下的未来发展图景。',
    },
    highlights: ['行业管理体制与法规标准的演进', '媒体融合与人工智能的应用趋势', '国际传播与未来传播形态展望'],
    docs: [
      { title: '管理历程', body: '体制机制与法规标准建设的演进脉络。' },
      { title: '未来展望', body: '媒体融合、人工智能与全球传播的趋势。' },
    ],
    model: { name: '实物模型', body: '实物模型展台（占位），后续可替换为真实展品。' },
    facts: [
      { label: '篇章', value: '六 · 管理与展望' },
      { label: '关键词', value: '融合 · 展望' },
      { label: '展项', value: '展板 / 文献 / 模型' },
    ],
  },
]

export const HALL_NAMES = HALLS.map((hall) => hall.name)
