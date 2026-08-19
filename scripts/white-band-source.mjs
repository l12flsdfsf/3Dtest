// 白带真源定位：同机位下，密集 NDC 网格射线（mesh/材质/UV）与截图像素亮度
// 联合分析，找出亮度>230 的像素对应的材质与 UV
import { chromium } from 'playwright-core'
import fs from 'node:fs'

fs.mkdirSync('.tmp-ktx', { recursive: true })
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
await page.screenshot({ path: '.tmp-ktx/wb-probe.png', timeout: 90000 })

// 密集网格射线（右半屏 + 上半，覆盖门框区域）
const hits = await page.evaluate(() => {
  const { Raycaster, Vector2 } = window.__THREE
  const rows = []
  for (let nx = 0.3; nx <= 0.95; nx += 0.025) {
    for (let ny = -0.1; ny <= 0.5; ny += 0.04) {
      const raycaster = new Raycaster()
      raycaster.setFromCamera(new Vector2(nx, ny), window.__camera)
      const list = raycaster.intersectObject(window.__gltfScene, true)
      if (!list.length) continue
      const h = list[0]
      const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
      const mat = mats[h.face?.materialIndex ?? 0] ?? mats[0]
      rows.push({
        nx: +nx.toFixed(3),
        ny: +ny.toFixed(3),
        mesh: h.object.name,
        material: mat?.name ?? '',
        uv: h.uv ? [+h.uv.x.toFixed(3), +h.uv.y.toFixed(3)] : null,
        y: +h.point.y.toFixed(1),
      })
    }
  }
  return rows
})
await browser.close()

// 与截图像素亮度关联
const sharp = (await import('sharp')).default
const { data, info } = await sharp('.tmp-ktx/wb-probe.png').raw().toBuffer({ resolveWithObject:true })
const W = info.width, H = info.height, C = info.channels
const bright = []
const byMaterial = {}
for (const h of hits) {
  const sx = Math.round(((h.nx + 1) / 2) * (W - 1))
  const sy = Math.round(((1 - (h.ny + 1) / 2)) * (H - 1))
  const i = (sy * W + sx) * C
  const lum = 0.3 * data[i] + 0.6 * data[i + 1] + 0.1 * data[i + 2]
  if (lum > 228) {
    const key = `${h.mesh}|${h.material}`
    byMaterial[key] = byMaterial[key] ?? { count: 0, uvU: [], uvV: [], lums: [] }
    byMaterial[key].count += 1
    if (h.uv) { byMaterial[key].uvU.push(h.uv[0]); byMaterial[key].uvV.push(h.uv[1]) }
    byMaterial[key].lums.push(Math.round(lum))
  }
}
console.log('=== 亮白像素(>228)按网格/材质统计 ===')
for (const [key, v] of Object.entries(byMaterial).sort((a, b) => b[1].count - a[1].count)) {
  const uRange = v.uvU.length ? `${Math.min(...v.uvU)}-${Math.max(...v.uvU)}` : '-'
  const vRange = v.uvV.length ? `${Math.min(...v.uvV)}-${Math.max(...v.uvV)}` : '-'
  const lumAvg = (v.lums.reduce((s, x) => s + x, 0) / v.lums.length).toFixed(0)
  console.log(`${key}: ${v.count} 点, UV u=${uRange} v=${vRange}, 平均亮度 ${lumAvg}`)
}
