import { HALLS, HALL_NAMES, LOCAL_ANCHORS, roomToWorld } from './halls.js'

const TYPE_META = {
  theme: { code: '展板', tag: '主题展板', subtitle: '主题展板（进门右侧）' },
  doc: { code: '文献', tag: '文献资料', subtitle: '文献资料 · 后墙展陈' },
  model: { code: '模型', tag: '实物模型', subtitle: '实物模型 · 中央展台' },
}

function buildHotspots() {
  const list = []

  HALLS.forEach((hall, index) => {
    const idx = index + 1
    const tag = `${idx}. ${hall.chapter}`

    // 主题展板
    list.push({
      id: `${hall.id}-theme`,
      hallId: hall.id,
      kind: 'theme',
      position: roomToWorld(hall, LOCAL_ANCHORS.themeHotspot),
      color: hall.color,
      code: `${idx}·${TYPE_META.theme.code}`,
      tag,
      title: hall.name,
      subtitle: TYPE_META.theme.subtitle,
      scenePreview: hall.image,
      description: hall.theme.body,
      bullets: hall.highlights,
      facts: hall.facts,
      route: ['入口 / 展馆大厅', ...HALL_NAMES],
    })

    // 文献资料
    list.push({
      id: `${hall.id}-doc`,
      hallId: hall.id,
      kind: 'doc',
      position: roomToWorld(hall, LOCAL_ANCHORS.docHotspot),
      color: hall.color,
      code: `${idx}·${TYPE_META.doc.code}`,
      tag,
      title: hall.name,
      subtitle: TYPE_META.doc.subtitle,
      scenePreview: hall.image,
      description: hall.docs.map((doc) => `${doc.title}：${doc.body}`).join('　'),
      bullets: hall.docs.map((doc) => `${doc.title}：${doc.body}`),
      facts: hall.facts,
    })
  })

  return list
}

export const HOTSPOTS = buildHotspots()
