// 扫奖杯墙区域：所有网格的材质/贴图/透明度/覆盖情况
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__THREE, null, { timeout: 120000 })

const result = await page.evaluate(() => {
  const THREE = window.__THREE
  const rows = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty()) return
    const center = box.getCenter(new THREE.Vector3())
    // 奖杯墙区域（荣誉篇章附近，含之前发现的奖杯1位置 2.96,-17.42）
    if (center.x < -5 || center.x > 8 || center.z < -21 || center.z > -13) return
    const size = box.getSize(new THREE.Vector3())
    const maxSpan = Math.max(size.x, size.y, size.z)
    if (maxSpan > 2.5) return // 跳过墙体等大结构

    const mats = Array.isArray(o.material) ? o.material : [o.material]
    rows.push({
      mesh: o.name.slice(0, 30),
      mat: mats[0]?.name || '',
      map: mats.map((m) => m?.map?.name || '').filter(Boolean).join(','),
      trans: mats.some((m) => m?.transparent),
      opacity: +Math.min(...mats.map((m) => m?.opacity ?? 1)).toFixed(2),
      y: `${+box.min.y.toFixed(1)}~${+box.max.y.toFixed(1)}`,
      x: +center.x.toFixed(1),
      z: +center.z.toFixed(1),
      span: +maxSpan.toFixed(2),
    })
  })
  return rows
})

const covered = (row) => /^[\u4e00-\u9fff].*_basecolor$/i.test(row.map) || /^(mesh_rep|Box003|Cylinder002|JiangBei|对象001|pCube229|pCube230)/.test(row.mesh)
for (const row of result.sort((a, b) => a.x - b.x)) {
  const flag = covered(row) ? '已覆盖' : '★未覆盖'
  console.log(`${flag} ${row.mesh} [${row.mat}] map=${row.map || '-'} trans=${row.trans}/${row.opacity} y=${row.y} at(${row.x},${row.z}) span=${row.span}`)
}
await browser.close()
