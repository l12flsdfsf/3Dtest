// 柜内展品发黑探针：找书籍等柜内展品网格，检查材质参数（金属度/贴图/自发光）
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true })
await page.waitForFunction(() => window.__gltfScene && window.__camera, null, { timeout: 120000 })
await page.waitForTimeout(1500)

const result = await page.evaluate(() => {
  const { Box3, Vector3 } = window.__THREE
  const rows = []
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const hit = materials.some((m) => {
      const mapName = typeof m?.map?.name === 'string' ? m.map.name : ''
      return /书/.test(mapName) || /书/.test(m?.name ?? '') || /书/.test(object.name)
    })
    if (!hit) return
    const box = new Box3().setFromObject(object)
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3())
    rows.push({
      mesh: object.name,
      center: center.toArray().map((v) => +v.toFixed(1)),
      mats: materials.map((m) => ({
        name: m?.name ?? '',
        color: m?.color ? `#${m.color.getHexString()}` : '',
        metalness: m?.metalness,
        roughness: m?.roughness,
        map: m?.map?.name ?? '',
        mapColorSpace: m?.map?.colorSpace,
        emissive: m?.emissive ? `#${m.emissive.getHexString()}` : '',
        emissiveIntensity: m?.emissiveIntensity,
      })),
    })
  })
  return rows
})
console.log(`书籍相关网格 ${result.length} 个：`)
for (const row of result.slice(0, 30)) {
  console.log(`${row.mesh} @(${row.center.join(',')})`)
  for (const m of row.mats) console.log(`   ${JSON.stringify(m)}`)
}
await browser.close()
