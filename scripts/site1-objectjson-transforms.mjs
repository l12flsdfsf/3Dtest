// 提取 Object3D.toJSON 尾部 object 树的变换（不解析几何，扫尾部即可）
// 用法: node scripts/site1-objectjson-transforms.mjs <json> [...]
import { openSync, statSync, readSync, closeSync } from 'node:fs'

for (const path of process.argv.slice(2)) {
  const st = statSync(path)
  const fd = openSync(path, 'r')
  const CH = 4 * 1024 * 1024
  let tail = ''
  for (let end = st.size; end > 0; end -= CH) {
    const n = Math.min(CH, end)
    const buf = Buffer.alloc(n)
    readSync(fd, buf, 0, n, end - n)
    tail = buf.toString('utf8') + tail
    const i = tail.indexOf('"object":')
    if (i !== -1) {
      // 括号配平提取 object 值（跳过字符串内的括号/转义）
      let depth = 0
      let start = -1
      let stop = -1
      let inStr = false
      let esc = false
      for (let k = i + 9; k < tail.length; k += 1) {
        const c = tail[k]
        if (esc) { esc = false; continue }
        if (c === '\\') { esc = true; continue }
        if (c === '"') { inStr = !inStr; continue }
        if (inStr) continue
        if (c === '{' || c === '[') { if (depth === 0) start = k; depth += 1 } else
        if (c === '}' || c === ']') { depth -= 1; if (depth === 0) { stop = k + 1; break } }
      }
      const obj = JSON.parse(tail.slice(start, stop))
      console.log('='.repeat(60))
      console.log(path.split('/').pop())
      const fmt = (v) =>
        v ? (Array.isArray(v) ? v.map((x) => Math.round(x * 1000) / 1000).join(',') : '?') : '-'
      const walk = (o, d) => {
        console.log(
          `${'  '.repeat(d)}${o.name || o.type} pos[${fmt(o.position)}] rot[${fmt(o.rotation)}] scale[${fmt(o.scale)}]`,
        )
        for (const c of o.children ?? []) walk(c, d + 1)
      }
      walk(obj, 0)
      break
    }
  }
  closeSync(fd)
}
