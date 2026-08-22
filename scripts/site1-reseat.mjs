// 设备落座分析/修正：以新场地家具（柜面）为支撑面，检测并修复悬空/出柜设备
// 原理：设备被恢复到旧模型坐标，但新场地柜台挪位 → 旧坐标无支撑 → 悬空。
//       把无支撑设备平移到最近柜面（保持朝向，底面贴柜面顶）。
// 用法: node scripts/site1-reseat.mjs --check   只测不改，列出悬空设备与候选柜面
//       node scripts/site1-reseat.mjs --fix     生成修正表 models-src/site1-migration/reseat.json
import { readFileSync, writeFileSync } from 'node:fs'

const MODE = process.argv[2] ?? '--check'

function loadDoc(file) {
  const buf = readFileSync(file)
  const l = buf.readUInt32LE(12)
  return JSON.parse(buf.slice(20, 20 + l).toString('utf8'))
}
// 节点级子树世界盒（多 primitive 取联合，避免把墙板上的小饰件误当柜面）
function nodeBoxes(j) {
  const out = []
  const mat4 = (n, p) => {
    let m
    if (n.matrix) m = n.matrix
    else {
      const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1]
      const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z
      const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2
      const wx = w * x2, wy = w * y2, wz = w * z2
      m = [
        (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
        (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
        (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
        t[0], t[1], t[2], 1,
      ]
    }
    if (!p) return m
    const o = new Array(16).fill(0)
    for (let cc = 0; cc < 4; cc++)
      for (let r = 0; r < 4; r++)
        for (let k = 0; k < 4; k++) o[cc * 4 + r] += p[k * 4 + r] * m[cc * 4 + k]
    return o
  }
  const ap = (m, p) => [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ]
  const visit = (i, pm) => {
    const n = j.nodes[i]
    const m = mat4(n, pm)
    let box = null
    if (n.mesh !== undefined)
      for (const p of j.meshes[n.mesh].primitives || []) {
        const acc = j.accessors[p.attributes?.POSITION]
        if (!acc?.min) continue
        for (const x of [acc.min[0], acc.max[0]])
          for (const y of [acc.min[1], acc.max[1]])
            for (const z of [acc.min[2], acc.max[2]]) {
              const w = ap(m, [x, y, z])
              if (!box) box = { min: [...w], max: [...w] }
              else
                for (let k = 0; k < 3; k++) {
                  box.min[k] = Math.min(box.min[k], w[k])
                  box.max[k] = Math.max(box.max[k], w[k])
                }
            }
      }
    for (const c of n.children || []) {
      // 子节点盒并入（世界坐标下）
      const sub = visit(c, m)
      if (sub && box)
        for (let k = 0; k < 3; k++) {
          box.min[k] = Math.min(box.min[k], sub.min[k])
          box.max[k] = Math.max(box.max[k], sub.max[k])
        }
      else if (sub && !box) box = sub
    }
    if (box) out.push({ name: n.name, min: box.min, max: box.max })
    return box
  }
  for (const r of j.scenes[j.scene || 0].nodes || []) visit(r, null)
  return out
}

// —— 场地支撑面：per-primitive 盒，顶面 0.3~1.7m、短边≥0.25（含细长柜）、高度≤1.2（排除墙板）——
const supports = []
for (const f of ['大厅.materials.glb', '左侧.materials.glb', '右侧.materials.glb']) {
  const j = loadDoc(`models-src/site1-migration/${f}`)
  for (const n of j.nodes || []) {
    if (n.mesh === undefined) continue
    const t = n.translation || [0, 0, 0]
    const s = n.scale || [1, 1, 1]
    for (const p of j.meshes[n.mesh].primitives || []) {
      const a = j.accessors[p.attributes?.POSITION]
      if (!a?.min) continue
      const min = [a.min[0] * s[0] + t[0], a.min[1] * s[1] + t[1], a.min[2] * s[2] + t[2]]
      const max = [a.max[0] * s[0] + t[0], a.max[1] * s[1] + t[1], a.max[2] * s[2] + t[2]]
      const top = max[1]
      const sx = max[0] - min[0]
      const sz = max[2] - min[2]
      if (top < 0.3 || top > 1.7) continue
      if (Math.min(sx, sz) < 0.25 || Math.max(sx, sz) > 12) continue
      if (top - min[1] > 1.2) continue
      supports.push({ name: n.name, min, max, top })
    }
  }
}
console.log(`场地支撑面: ${supports.length} 个`)

// —— 设备世界盒（未压缩中间件）——
const EQUIP = ['电影厅设备', '广播厅设备', '技术厅设备', '电视厅设备', '奖杯']
const fixes = []
for (const name of EQUIP) {
  if (name === '奖杯') continue // 奖杯墙是壁挂分层(底 0.9~3.4m)，不在本次"柜面落座"范围
  const doc = loadDoc(`models-src/site1-migration/${name}.glb`)
  const boxes = nodeBoxes(doc)
  const parentOf = new Map()
  doc.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)))
  for (const [i, n] of doc.nodes.entries()) {
    if (parentOf.has(i) || n.mesh === undefined) continue
    if (!/^tripo_node_|^JiangBei|^CD$|^Box00|^Cylinder00|^对象/.test(n.name || '')) continue
    // 该顶层的子树盒
    let box = null
    const collect = (idx) => {
      for (const b of boxes) {
        if (b.name === doc.nodes[idx].name) {
          if (!box) box = { min: [...b.min], max: [...b.max] }
          else
            for (let k = 0; k < 3; k++) {
              box.min[k] = Math.min(box.min[k], b.min[k])
              box.max[k] = Math.max(box.max[k], b.max[k])
            }
          break
        }
      }
      for (const c of doc.nodes[idx].children || []) collect(c)
    }
    collect(i)
    if (!box) continue
    const bottom = box.min[1]
    // 脚印（收缩 25%，要求主体踩在支撑上）
    const fx0 = box.min[0] + (box.max[0] - box.min[0]) * 0.25
    const fx1 = box.max[0] - (box.max[0] - box.min[0]) * 0.25
    const fz0 = box.min[2] + (box.max[2] - box.min[2]) * 0.25
    const fz1 = box.max[2] - (box.max[2] - box.min[2]) * 0.25
    const overlap = supports.filter(
      (s) => fx1 > s.min[0] && fx0 < s.max[0] && fz1 > s.min[2] && fz0 < s.max[2] && Math.abs(s.top - bottom) < 0.6,
    )
    if (overlap.length) {
      const best = overlap.sort((a, b2) => Math.abs(a.top - bottom) - Math.abs(b2.top - bottom))[0]
      const dy = best.top - bottom
      if (Math.abs(dy) > 0.06)
        fixes.push({ file: name, node: n.name, type: 'reseatY', dx: 0, dz: 0, dy: +Math.max(-0.6, Math.min(0.6, dy)).toFixed(3), support: best.name, top: +best.top.toFixed(2), oldBottom: +bottom.toFixed(2) })
      continue
    }
    // 无重叠支撑：新柜体整体偏移/缺失。1.2m 内有柜面 → 平移贴上（实测新柜比旧位西移~0.4m）；
    // 实在没有（柜台未交付区域）→ 落地靠墙，等技术补柜台后再归位
    const cx = (box.min[0] + box.max[0]) / 2
    const cz = (box.min[2] + box.max[2]) / 2
    let nearest = null
    for (const s of supports) {
      const dx = Math.max(s.min[0] - cx, 0, cx - s.max[0])
      const dz = Math.max(s.min[2] - cz, 0, cz - s.max[2])
      const dist = Math.hypot(dx, dz)
      if (dist > 1.2) continue
      if (Math.abs(s.top - bottom) > 0.9) continue
      if (!nearest || dist < nearest.dist) nearest = { ...s, dist, dx, dz }
    }
    if (nearest) {
      // 平移到柜面中心带（只补齐出界方向的分量），底面贴柜顶
      const shiftX = nearest.dx > 0 ? -nearest.dx : 0
      const shiftZ = nearest.dz > 0 ? -nearest.dz : 0
      fixes.push({
        file: name,
        node: n.name,
        type: 'snap',
        dx: +shiftX.toFixed(3),
        dz: +shiftZ.toFixed(3),
        dy: +(nearest.top - bottom).toFixed(3),
        support: nearest.name,
        top: +nearest.top.toFixed(2),
        oldBottom: +bottom.toFixed(2),
      })
      continue
    }
    if (bottom > 0.15)
      fixes.push({ file: name, node: n.name, type: 'floor', dx: 0, dz: 0, dy: +(0.03 - bottom).toFixed(3), support: '(落地)', top: 0.03, oldBottom: +bottom.toFixed(2) })
    continue
  }
}

const snap = fixes.filter((f) => f.type === 'snap')
const reseatY = fixes.filter((f) => f.type === 'reseatY')
console.log(`\n落座修正: ${snap.length} 个需平移到柜面, ${reseatY.length} 个仅需调高度`)
for (const f of fixes)
  console.log(
    `  [${f.type}] ${f.file}/${f.node.slice(0, 30)} ${f.type === 'snap' ? `平移(${f.dx},${f.dz}) ` : ''}dy=${f.dy} -> ${f.support}@${f.top} (原底 ${f.oldBottom})`,
  )

if (MODE === '--fix') {
  writeFileSync('models-src/site1-migration/reseat.json', JSON.stringify(fixes, null, 1))
  console.log('\n修正表 -> models-src/site1-migration/reseat.json（merge 时应用）')
}
