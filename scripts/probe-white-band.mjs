// 白色条带精确定位：门框右立柱上半段，射线取 mesh/材质/UV，
// 并在页面上采样该 UV 对应贴图像素（canvas 读回）
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true })
await page.waitForFunction(() => window.__teleport && window.__gltfScene && window.__camera, null, { timeout: 120000 })
await page.waitForTimeout(3000)
await page.evaluate(() => window.__teleport({ x: 4, y: 1.7, z: 13.5 }, { x: 9.4, y: 3.4, z: 8.9 }))
await page.waitForTimeout(2500)

const result = await page.evaluate(() => {
  const { Raycaster, Vector2 } = window.__THREE
  const rows = []
  // 门框右立柱上半段：屏幕 NDC 网格扫描
  for (const [nx, ny] of [[0.62, 0.3], [0.68, 0.25], [0.74, 0.2], [0.8, 0.3], [0.7, 0.35], [0.65, 0.15]]) {
    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2(nx, ny), window.__camera)
    const hits = raycaster.intersectObject(window.__gltfScene, true)
    if (!hits.length) { rows.push({ nx, ny, hit: null }); continue }
    const h = hits[0]
    const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
    const mat = mats[h.face?.materialIndex ?? 0] ?? mats[0]
    rows.push({
      nx, ny,
      mesh: h.object.name,
      material: mat?.name ?? '',
      emissiveIntensity: mat?.emissiveIntensity,
      uv: h.uv ? [+h.uv.x.toFixed(4), +h.uv.y.toFixed(4)] : null,
      worldY: +h.point.y.toFixed(2),
    })
  }
  return rows
})
for (const r of result) console.log(r.hit === null ? `(${r.nx},${r.ny}) 未命中` : JSON.stringify(r))

// 对命中的主要 mesh+材质，采样其贴图在 UV 处的颜色（GPU 读回）
const sample = await page.evaluate(async (uvList) => {
  // 用第一个命中对象的材质贴图做代表
  const { Raycaster, Vector2 } = window.__THREE
  const raycaster = new Raycaster()
  raycaster.setFromCamera(new Vector2(0.68, 0.25), window.__camera)
  const hits = raycaster.intersectObject(window.__gltfScene, true)
  if (!hits.length || !hits[0].uv) return null
  const h = hits[0]
  const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
  const mat = mats[h.face?.materialIndex ?? 0] ?? mats[0]
  const tex = mat?.map
  if (!tex?.image) return { error: 'no image' }
  const img = tex.image
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(img.width, 2048)
  canvas.height = Math.min(img.height, 2048)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const out = []
  for (const uv of uvList) {
    const x = Math.round(uv[0] * (canvas.width - 1))
    const y = Math.round((1 - uv[1]) * (canvas.height - 1))
    const d = ctx.getImageData(x, y, 1, 1).data
    out.push({ uv, pixel: [d[0], d[1], d[2], d[3]] })
  }
  return { material: mat.name, mapName: tex.name, imgSize: `${img.width}x${img.height}`, samples: out }
}, (result.find((r) => r.uv) ? [result.find((r) => r.uv).uv, ...result.filter((r) => r.uv && r !== result.find((q) => q.uv)).slice(0, 3).map((r) => r.uv)] : []))
console.log('贴图采样:', JSON.stringify(sample, null, 1))
await browser.close()
