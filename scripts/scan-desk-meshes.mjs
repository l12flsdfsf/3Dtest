// 全场景扫“桌面”候选网格：y∈[0.4,1.3]、XZ 尺寸像家具，列名字+世界坐标+canonical 位置
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__worldLayout && window.__playerDebug?.collision === true, null, { timeout: 120000 })

const result = await page.evaluate(() => {
  const t = window.__worldLayout.transform
  const [a, b, e] = t.x, [c, d, f] = t.z
  const det = a * d - b * c
  const toCanon = (wx, wz) => ({
    x: +(((d * (wx - e) - b * (wz - f)) / det)).toFixed(1),
    z: +(((-c * (wx - e) + a * (wz - f)) / det)).toFixed(1),
  })
  const desks = []
  const all = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const g = o.geometry
    if (!g?.attributes?.position) return
    o.updateWorldMatrix(true, false)
    g.computeBoundingBox()
    const wb = g.boundingBox.clone().applyMatrix4(o.matrixWorld)
    const yMin = wb.min.y, yMax = wb.max.y
    const sx = wb.max.x - wb.min.x, sz = wb.max.z - wb.min.z
    all.push(o.name)
    // 桌面候选：高度覆盖 0.5~1.3，XY 尺寸至少一边 >0.7，且不是超大结构
    if (yMin > 0.2 && yMax < 1.6 && Math.max(sx, sz) > 0.6 && Math.max(sx, sz) < 6) {
      const center = toCanon((wb.min.x + wb.max.x) / 2, (wb.min.z + wb.max.z) / 2)
      const mat = Array.isArray(o.material) ? o.material[0] : o.material
      desks.push({
        name: o.name,
        mat: mat?.name || '',
        yMin: +yMin.toFixed(2), yMax: +yMax.toFixed(2),
        size: `${sx.toFixed(2)}x${sz.toFixed(2)}`,
        canon: `(${center.x}, ${center.z})`,
        color: mat?.color ? `#${mat.color.getHexString()}` : '',
        map: mat?.map?.name || (mat?.map ? '(map)' : ''),
      })
    }
  })
  return { total: all.length, desks }
})
console.log(`场景总网格 ${result.total} 个，桌面候选 ${result.desks.length} 个:`)
for (const d of result.desks) {
  console.log(`  ${d.name} [${d.mat}] y=${d.yMin}~${d.yMax} size=${d.size} canon=${d.canon} color=${d.color} map=${d.map}`)
}
await browser.close()
