// 扫描独立展柜的玻璃：列出 玻璃/电视厅玻璃 等材质的网格位置，
// 以及名字带「展柜/柜」的网格材质构成，定位用户说的黑玻璃展柜
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true })
await page.waitForFunction(() => window.__gltfScene, null, { timeout: 120000 })
await page.waitForTimeout(1500)

const result = await page.evaluate(() => {
  const { Box3, Vector3 } = window.__THREE
  const rows = []
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const matInfo = materials.map((m) => ({
      name: m?.name ?? '',
      transparent: m?.transparent ?? false,
      opacity: m?.opacity,
      transmission: m?.transmission ?? 0,
      metalness: m?.metalness,
      roughness: m?.roughness,
      map: m?.map?.name ?? (m?.map ? '(unnamed)' : ''),
    }))
    const isGlassy = matInfo.some(
      (m) => /玻璃|glass/i.test(m.name) || m.transparent || (m.map && /玻璃|glass/i.test(m.map)),
    )
    const nameCabinet = /展柜|展示柜|柜(?![\s\S]*墙)/.test(object.name)
    if (!isGlassy && !nameCabinet) return
    const box = new Box3().setFromObject(object)
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    rows.push({
      mesh: object.name,
      center: center.toArray().map((v) => +v.toFixed(1)),
      size: size.toArray().map((v) => +v.toFixed(1)),
      mats: matInfo,
    })
  })
  // 按材质名汇总
  const byMat = {}
  for (const row of rows) {
    for (const m of row.mats) {
      const key = m.name || '(unnamed)'
      byMat[key] = byMat[key] ?? { count: 0, transparent: m.transparent, opacity: m.opacity, metalness: m.metalness, roughness: m.roughness, map: m.map }
      byMat[key].count += 1
    }
  }
  return { rows, byMat }
})
console.log('=== 玻璃类/透明材质汇总 ===')
for (const [name, info] of Object.entries(result.byMat)) {
  console.log(`${name} × ${info.count}  transparent=${info.transparent} opacity=${info.opacity} metal=${info.metalness} rough=${info.roughness} map=${info.map}`)
}
console.log('\n=== 相关网格（前 40 个） ===')
for (const row of result.rows.slice(0, 40)) {
  console.log(`${row.mesh} @(${row.center.join(',')}) 尺寸(${row.size.join(',')}) 材质[${row.mats.map((m) => m.name).join(',')}]`)
}
console.log(`共 ${result.rows.length} 个网格`)
await browser.close()
