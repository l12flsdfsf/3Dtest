// 定位画面中央白色光晕的来源：从相机中心射线，看命中什么网格/材质，
// 同时列出模型里所有自发光强度高的材质（可能是灯模型）
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true })
await page.waitForFunction(() => window.__gltfScene && window.__camera, null, { timeout: 120000 })
await page.waitForTimeout(3000)

const result = await page.evaluate(() => {
  const { Raycaster, Vector2 } = window.__THREE
  // 画面中心及周围一圈的射线命中
  const probes = []
  for (const [nx, ny, label] of [
    [0, 0, '正中'], [0, 0.15, '中上'], [0, -0.15, '中下'], [0.1, 0.1, '右上偏中'], [-0.1, 0.1, '左上偏中'],
  ]) {
    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2(nx, ny), window.__camera)
    const hits = raycaster.intersectObject(window.__gltfScene, true)
    if (!hits.length) { probes.push({ label, hit: null }); continue }
    const h = hits[0]
    const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
    const mat = mats[h.face?.materialIndex ?? 0] ?? mats[0]
    probes.push({
      label,
      mesh: h.object.name,
      material: mat?.name ?? '',
      emissive: mat?.emissive ? `#${mat.emissive.getHexString()}` : '',
      emissiveIntensity: mat?.emissiveIntensity,
      distance: +h.distance.toFixed(2),
      point: h.point.toArray().map((v) => +v.toFixed(1)),
    })
  }

  // 模型里自发光强的材质（找灯）
  const bright = []
  const seen = new Set()
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    const mats = Array.isArray(object.material) ? object.material : [object.material]
    for (const m of mats) {
      if (!m || seen.has(m.uuid)) continue
      seen.add(m.uuid)
      const e = m.emissive
      const strength = e ? (e.r + e.g + e.b) / 3 * (m.emissiveIntensity ?? 1) : 0
      if (strength > 0.85) bright.push({ name: m.name, emissive: `#${e.getHexString()}`, intensity: m.emissiveIntensity })
    }
  })
  return { probes, bright: bright.slice(0, 15) }
})
console.log('=== 画面中央射线命中 ===')
for (const p of result.probes) console.log(`${p.label}: ${p.hit === null ? '未命中' : JSON.stringify(p)}`)
console.log('\n=== 自发光强的材质（可能是灯） ===')
for (const b of result.bright) console.log(JSON.stringify(b))
await browser.close()
