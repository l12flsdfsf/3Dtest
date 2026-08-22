// 定位并隔离「朝大门方向看时地面大片反光」的确切来源：
// 1) 在画面里找亮斑包围盒（下半幅高亮度像素聚类）
// 2) 对亮斑区域网格射线（打整个 R3F 根场景，含 R3F 挂载的叠加面片）→ 命中网格/材质/UV/世界坐标
// 3) 逐项 A/B：隐藏命中网格 / 去掉 map / 去掉 emissiveMap / envMapIntensity=1 / roughness=1
import { readFileSync } from 'node:fs'
import fs from 'node:fs'
import { chromium } from 'playwright-core'

const OUT = '.tmp-gate-floor'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__teleport && window.__worldLayout,
  null,
  { timeout: 300000, polling: 2000 },
)
for (let attempt = 0; attempt < 5; attempt++) {
  await page.evaluate(() => document.querySelector('button[aria-label="关闭"]')?.click())
  const gone = await page.evaluate(() => !document.querySelector('button[aria-label="关闭"]'))
  if (gone) break
  await page.waitForTimeout(1500)
}
await page.waitForFunction(() => window.__playerDebug?.collision === true, null, { timeout: 120000 })
await page.waitForTimeout(2000)
const spawn = await page.evaluate(() => window.__camera.position.toArray().map((v) => +v.toFixed(2)))
console.log('出生点:', JSON.stringify(spawn))

// 进自主漫游（inspect 的 OrbitControls 会抢相机）
await page.click('button[aria-label="切换到自动漫游"]', { force: true })
await page.waitForTimeout(1200)
await page.click('button[aria-label="切换到自主漫游"]', { force: true })
await page.waitForTimeout(1200)

const settle = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let left = 4
        const tick = () => { if (--left <= 0) resolve(); else requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      }),
  )

const shot = async (name) => {
  await settle()
  const path = `${OUT}/${name}.png`
  await page.screenshot({ path, timeout: 120000 })
  return path
}

// 与用户一致的机位：入口内侧 5m，朝大门方向
await page.evaluate(({ eye, look }) => window.__teleport(eye, look), {
  eye: { x: spawn[0], y: 1.72, z: spawn[2] - 5 },
  look: { x: spawn[0] - 1.5, y: 0.9, z: spawn[2] + 7 },
})
const basePath = await shot('iso-base')
console.log('基线:', basePath)

// 亮斑包围盒（下半幅亮度>230 的像素聚类，简单行列投影）
const patchBBox = await page.evaluate(async (b64) => {
  const img = new Image()
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = 'data:image/png;base64,' + b64 })
  const c = new OffscreenCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, img.width, img.height).data
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0
  for (let y = Math.floor(img.height * 0.3); y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const k = (y * img.width + x) * 4
      const l = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]
      if (l > 232) {
        count++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { count, bbox: count ? { minX, minY, maxX, maxY } : null, w: img.width, h: img.height }
}, readFileSync(basePath).toString('base64'))
console.log('亮斑(>232):', JSON.stringify(patchBBox))

// 对亮斑中心与四角射线（整个根场景，含 R3F 叠加面片）
const patchHits = await page.evaluate((bbox) => {
  const { Raycaster, Vector2 } = window.__THREE
  const root = window.__gltfScene.parent
  const pts = []
  const cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2
  for (const [px, py, label] of [
    [cx, cy, '中心'],
    [(bbox.minX + cx) / 2, (bbox.minY + cy) / 2, '左上内'],
    [(cx + bbox.maxX) / 2, (bbox.minY + cy) / 2, '右上内'],
    [cx, bbox.maxY, '下缘'],
    [bbox.minX, cy, '左缘'],
    [bbox.maxX, cy, '右缘'],
  ]) {
    const rc = new Raycaster()
    rc.setFromCamera(new Vector2((px / 1280) * 2 - 1, -(py / 720) * 2 + 1), window.__camera)
    const hits = rc.intersectObject(root, true)
    pts.push({
      label,
      hits: hits.slice(0, 3).map((h) => {
        const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
        const m = mats[h.face?.materialIndex ?? 0] ?? mats[0]
        return {
          mesh: h.object.name,
          inGltf: !!(h.object.parent && h.object.parent.name !== ''),
          mat: m?.name ?? '',
          y: +h.point.y.toFixed(3),
          dist: +h.distance.toFixed(2),
          uv: h.uv ? [+h.uv.x.toFixed(3), +h.uv.y.toFixed(3)] : null,
          blending: m?.blending,
          transparent: m?.transparent,
          type: m?.type,
        }
      }),
    })
  }
  return pts
}, patchBBox.bbox ?? { minX: 400, minY: 400, maxX: 800, maxY: 600 })
console.log('亮斑射线命中:')
for (const p of patchHits) console.log(' ', p.label, JSON.stringify(p.hits))

// 材质隔离实验
const experiments = [
  {
    name: 'iso-floor-hidden',
    apply: () => {
      const mesh = window.__gltfScene.getObjectByName('网格209_2')
      window.__iso = { mesh, visible: mesh.visible }
      mesh.visible = false
    },
    restore: () => { window.__iso.mesh.visible = window.__iso.visible },
  },
  {
    name: 'iso-floor-nomap',
    apply: () => {
      const mesh = window.__gltfScene.getObjectByName('网格209_2')
      const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      window.__iso = { m, map: m.map, emissiveMap: m.emissiveMap, emissive: m.emissive.clone(), color: m.color.clone() }
      m.map = null
      m.emissiveMap = null
      m.emissive.set(0)
      m.color.set(0.75)
      m.needsUpdate = true
    },
    restore: () => {
      const { m, map, emissiveMap, emissive, color } = window.__iso
      m.map = map
      m.emissiveMap = emissiveMap
      m.emissive.copy(emissive)
      m.color.copy(color)
      m.needsUpdate = true
    },
  },
  {
    name: 'iso-floor-env1',
    apply: () => {
      const mesh = window.__gltfScene.getObjectByName('网格209_2')
      const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      window.__iso = { m, env: m.envMapIntensity }
      m.envMapIntensity = 1
      m.needsUpdate = true
    },
    restore: () => { window.__iso.m.envMapIntensity = window.__iso.env; window.__iso.m.needsUpdate = true },
  },
]

const readImg = (b64) =>
  page.evaluate(async (b64) => {
    const img = new Image()
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = 'data:image/png;base64,' + b64 })
    const c = new OffscreenCanvas(img.width, img.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, img.width, img.height).data
  }, b64)

for (const exp of experiments) {
  await page.evaluate(exp.apply)
  const path = await shot(exp.name)
  await page.evaluate(exp.restore)
  const [da, db] = [await readImg(readFileSync(basePath).toString('base64')), await readImg(readFileSync(path).toString('base64'))]
  let changed = 0, sum = 0
  for (let k = 0; k < da.length; k += 16) {
    const la = 0.299 * da[k] + 0.587 * da[k + 1] + 0.114 * da[k + 2]
    const lb = 0.299 * db[k] + 0.587 * db[k + 1] + 0.114 * db[k + 2]
    const d = Math.abs(la - lb)
    if (d > 3) { changed++; sum += d }
  }
  console.log(`${exp.name}: 变化像素 ${(changed / (da.length / 16) * 100).toFixed(1)}% 平均Δ${sum / (changed || 1) | 0}`)
}

await browser.close()
