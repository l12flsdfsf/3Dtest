// 展柜实物展品说明：点击展柜里的 3D 实物（书本除外）弹出全屏查看器的文案。
// 键名 = 模型内展品贴图名去掉 _basecolor 后缀（如 手摇式录音机_basecolor -> 手摇式录音机）。
// 值为字符串（仅正文）或对象 { subtitle, body, audio }；audio 为解说音频地址，后续上传后配入即自动可播。
// 描述保持中性、只讲设备功能定位，不虚构年代/来源。

export const EXHIBIT_INFO = {
  压力陶瓷喇叭: '压电陶瓷喇叭，早期有线广播入户收听的常用发声器件。',
  声频功率放大器: '音频功率放大设备，将话筒等信号放大后驱动喇叭播出。',
  录音机: '磁带录音机，用于节目录制与声音资料保存。',
  手摇式录音机: '手摇发电驱动的录音机，可在无外部电源的环境中使用。',
  晶体管收音机: '晶体管收音机，体积小、功耗低，广播走进千家万户的代表设备。',
  '海燕8-晶体管收音机': '「海燕」牌八管晶体管收音机，国产收音机的代表机型之一。',
  直流电子管收音机: '电子管收音机，直流供电，早期广播接收的主流机型。',
  自制晶体管收音机: '自行组装的晶体管收音机，见证了广播技术的大众化普及。',
  舌簧式喇叭: '舌簧式扬声器，早期有线广播系统的高灵敏度喇叭。',
  话筒1: '话筒（传声器），用于播音与现场拾音。',
  话筒2: '话筒（传声器），用于播音与现场拾音。',
  话筒3: '话筒（传声器），用于播音与现场拾音。',
  话筒4: '话筒（传声器），用于播音与现场拾音。',
  话筒5: '话筒（传声器），用于播音与现场拾音。',
  调频收转机: '调频广播接收转播设备，接收电台信号后转发，扩大覆盖范围。',
  便携式采访录音机: '便携式采访录音机，记者外出采访的录音设备。',
  录像机: '磁带录像机，用于电视节目录制、编辑与播出。',
  摄像机: '电视摄像机，将画面转换为视频信号的核心设备。',
  采访机: {
    subtitle: '广播电视专业设备',
    body: '采访录音机，新闻采访现场的声音记录设备。',
    // audio: '/audio/exhibits/caifangji.mp3', // 解说音频待上传
  },
  充电机: '蓄电池充电设备，为电子设备提供直流电源。',
  外差频率计: '外差式频率计，用于电台频率的测量与校准。',
  金属陶瓷四极管内部结构: '金属陶瓷四极管的剖切展示，可见内部电极结构。',
  马可尼电桥: '电桥式测量仪器，用于电路参数测量。',
  两用机: '收录两用机，兼具收音与录音功能。',
  接地电阻测试仪: '接地电阻测量仪器，用于检测接地系统。',
  控制台: '播控台，播音与节目切换的操作中枢。',
  照相机: '照相机，用于新闻图片摄影。',
  穿墙绝缘体: '穿墙绝缘子，线路穿墙时的绝缘支撑件。',
  自动排线机: '自动排线机，用于线圈绕制的自动排线。',
  静电电压表: '静电式电压表，用于高电压测量。',
  静电电压表2: '静电式电压表，用于高电压测量。',
  '15瓦电影还音设备扩音机': '15 瓦电影还音扩音机，影院还音系统的组成部分。',
  手摇电影倒片机: '手摇倒片机，胶片整理与倒片设备。',
  摄影机: '电影摄影机，胶片时代的拍摄设备。',
  放映机: '电影放映机，将胶片影像投映到银幕。',
  电影录音电源整流器: '电影录音设备的电源整流器。',
  电影放映银幕: '电影放映银幕。',
  电影洗印计算尺: '电影洗印计算尺，洗印工艺参数的计算工具。',
  // 奖杯1：查看器内展示高精度扫描模型（点击时才按需加载，不随场景加载）
  奖杯1: {
    subtitle: '荣誉展区实物',
    body: '荣誉奖杯，行业荣誉实物展品。',
    highPolyModel: '/models/trophy-1-high.glb',
  },
  // 奖杯3：查看器内展示高精度扫描模型（点击时才按需加载，不随场景加载）
  奖杯3: {
    subtitle: '荣誉展区实物',
    body: '荣誉奖杯，行业荣誉实物展品。',
    highPolyModel: '/models/trophy-3-high.glb',
  },
  // 奖杯4：查看器内展示高精度扫描模型（点击时才按需加载，不随场景加载）
  奖杯4: {
    subtitle: '荣誉展区实物',
    body: '荣誉奖杯，行业荣誉实物展品。',
    highPolyModel: '/models/trophy-4-high.glb',
  },
  奖杯7: '荣誉奖杯，行业荣誉实物展品。',
  奖杯9: '荣誉奖杯，行业荣誉实物展品。',
  奖杯10: {
    subtitle: '荣誉展区实物',
    body: '荣誉奖杯，行业荣誉实物展品。',
    highPolyModel: '/models/trophy-10-high.glb',
  },
  奖杯12: {
    subtitle: '荣誉展区实物',
    body: '荣誉奖杯，行业荣誉实物展品。',
    highPolyModel: '/models/trophy-12-high.glb',
  },
}

// 无命名贴图的实物（mesh_rep 照片扫描件、留声机组、唱片等）按 mesh 名接入。
// 这些模型在源文件里没有名称，标题按外观/所在厅取保守叫法，有准确名录后改这里即可。
// 每台独立设备一个条目；meshNames 仅用于同一物理对象的多个网格（如一台留声机的转盘+喇叭）。
export const MESH_EXHIBIT_INFO = {
  'scan-tv-1': {
    title: '老式电视机',
    subtitle: '电视厅实物',
    body: '照片扫描建模的早期电视机实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad'],
  },
  'scan-tv-2': {
    title: '老式电视机',
    subtitle: '电视厅实物',
    body: '照片扫描建模的早期电视机实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad001'],
  },
  'scan-tv-3': {
    title: '老式电视机',
    subtitle: '电视厅实物',
    body: '照片扫描建模的早期电视机实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad004'],
  },
  'scan-instr-tv-1': {
    title: '老式仪器',
    subtitle: '电视厅实物',
    body: '照片扫描建模的早期仪器设备实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad002'],
  },
  'scan-instr-tv-2': {
    title: '老式仪器',
    subtitle: '电视厅实物',
    body: '照片扫描建模的早期仪器设备实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad003'],
  },
  'scan-speaker-1': {
    title: '老式扬声器',
    subtitle: '展望厅实物',
    body: '照片扫描建模的早期扬声器实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad005'],
  },
  'scan-instr-future-1': {
    title: '老式仪器',
    subtitle: '展望厅实物',
    body: '照片扫描建模的早期仪器设备实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad008'],
  },
  'scan-device-tech-1': {
    title: '老式设备',
    subtitle: '技术设备厅实物',
    body: '照片扫描建模的早期设备实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad006'],
  },
  'scan-device-tech-2': {
    title: '老式设备',
    subtitle: '技术设备厅实物',
    body: '照片扫描建模的早期设备实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad007'],
  },
  'scan-device-tech-3': {
    title: '老式设备',
    subtitle: '技术设备厅实物',
    body: '照片扫描建模的早期设备实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad009'],
  },
  'scan-device-future-1': {
    title: '老式设备',
    subtitle: '展望厅实物',
    body: '照片扫描建模的早期设备实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad010'],
  },
  'scan-device-future-2': {
    title: '老式设备',
    subtitle: '展望厅实物',
    body: '照片扫描建模的早期设备实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad011'],
  },
  // 奖杯墙右下角的照片扫描奖杯：高模即同源扫描的高清版（jiangbei15.glb）
  'scan-device-honor-1': {
    title: '奖杯 15',
    subtitle: '荣誉展区实物',
    body: '荣誉奖杯，行业荣誉实物展品。',
    meshNames: ['mesh_rep_0_ori_repair_quad012'],
    highPolyModel: '/models/trophy-15-high.glb',
  },
  'scan-device-honor-2': {
    title: '陶瓷奖杯',
    subtitle: '荣誉展区实物',
    body: '奖杯墙陈列的陶瓷杯形荣誉奖杯实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad013'],
  },
  'scan-device-honor-3': {
    title: '金色荣誉奖杯',
    subtitle: '荣誉展区实物',
    body: '奖杯墙陈列的金色球形荣誉奖杯实物。',
    meshNames: ['mesh_rep_0_ori_repair_quad014'],
  },
  'gramophone-1': {
    title: '老式留声机',
    subtitle: '荣誉展区实物',
    body: '照片扫描建模的早期留声机实物（底座与转盘）。',
    meshNames: ['Box003', 'Cylinder002', 'JiangBei_14_1'],
  },
  'gramophone-2': {
    title: '老式留声机',
    subtitle: '荣誉展区实物',
    body: '照片扫描建模的早期留声机实物（底座与号角喇叭）。',
    meshNames: ['对象001', 'JiangBei_10_1'],
  },
  'disc-1': {
    title: '老式唱片',
    subtitle: '关怀厅实物',
    body: '陈列的早期唱片实物。',
    meshNames: ['pCube229'],
  },
  'disc-2': {
    title: '老式唱片',
    subtitle: '关怀厅实物',
    body: '陈列的早期唱片实物。',
    meshNames: ['pCube230'],
  },
  // 奖杯墙上的透明（水晶质感）奖杯：每件 = 透明杯体网格 + 底座/柱体网格
  'crystal-trophy-1': {
    title: '水晶奖杯',
    subtitle: '荣誉展区实物',
    body: '奖杯墙陈列的水晶质感奖杯实物。',
    meshNames: ['JiangBei_5_1', 'Box001', 'Cylinder001'],
  },
  'crystal-trophy-2': {
    title: '水晶奖杯',
    subtitle: '荣誉展区实物',
    body: '奖杯墙陈列的水晶质感奖杯实物。',
    meshNames: ['对象002', 'JiangBei_2_1'],
  },
  'crystal-trophy-3': {
    title: '水晶奖杯',
    subtitle: '荣誉展区实物',
    body: '奖杯墙陈列的水晶质感奖杯实物。',
    meshNames: ['JiangBei_6', 'Box002'],
  },
}

// mesh 名 -> 展品键（含 EXHIBIT_INFO 与 MESH_EXHIBIT_INFO 两类）
export const MESH_NAME_TO_EXHIBIT = {}
function meshNameAliases(name) {
  const aliases = new Set([name])
  const compact = String(name).replace(/[.\s]/g, '')
  aliases.add(compact)

  const dotted = compact.match(/^(.*\D)(\d{3})$/)
  if (dotted) aliases.add(`${dotted[1]}.${dotted[2]}`)

  if (compact.endsWith('_1')) aliases.add(compact.slice(0, -2))

  return [...aliases]
}

for (const [key, entry] of Object.entries(MESH_EXHIBIT_INFO)) {
  const meshNames = new Set()
  for (const meshName of entry.meshNames ?? []) {
    for (const alias of meshNameAliases(meshName)) {
      meshNames.add(alias)
      MESH_NAME_TO_EXHIBIT[alias] = key
    }
  }
  entry.meshNames = [...meshNames]
}

// 不参与展品 UI 的命名贴图（书本等）
export const EXHIBIT_EXCLUDES = new Set(['书'])

// 全部命名展品开放点击（含奖杯与按 mesh 名接入的扫描件）；登记过的键自动开放
export const CLICKABLE_EXHIBITS = new Set([...Object.keys(EXHIBIT_INFO), ...Object.keys(MESH_EXHIBIT_INFO)])

// 取展品展示信息（EXHIBIT_INFO 按贴图名 / MESH_EXHIBIT_INFO 按 mesh 名）；未登记的名字给通用兜底
export function getExhibitInfo(name) {
  const entry = EXHIBIT_INFO[name] ?? MESH_EXHIBIT_INFO[name]
  if (typeof entry === 'string') {
    return { title: name, subtitle: '展柜实物展品', body: entry, audio: null }
  }
  if (entry && typeof entry === 'object') {
    return {
      title: entry.title ?? name,
      subtitle: entry.subtitle ?? '展柜实物展品',
      body: entry.body ?? '',
      audio: entry.audio ?? null,
      meshNames: entry.meshNames ?? null,
      highPolyModel: entry.highPolyModel ?? null,
    }
  }
  return { title: name || '实物展品', subtitle: '展柜实物展品', body: '展柜实物展品。', audio: null }
}
