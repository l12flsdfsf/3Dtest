// 从运行中的页面导出设备/奖杯节点的世界摆位（供新交付的无摆位设备 JSON 迁移用）
// 用法: node scripts/site1-placement-export.mjs
import { chromium } from 'playwright-core'
import { writeFileSync, mkdirSync } from 'node:fs'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene, null, { timeout: 120000 })

const rows = await page.evaluate(() => {
  const scene = window.__gltfScene
  scene.updateMatrixWorld(true)
  const out = []
  const pos = new window.__THREE.Vector3()
  const quat = new window.__THREE.Quaternion()
  const scl = new window.__THREE.Vector3()
  const euler = new window.__THREE.Euler()
  scene.traverse((obj) => {
    const n = obj.name ?? ''
    if (!/^tripo_node_|^JiangBei|^CD$|^cidai|^Box00|^Cylinder00|^对象|^node_0|^pCube230|^polySurface46|^mesh_rep_0/.test(n)) return
    obj.matrixWorld.decompose(pos, quat, scl)
    euler.setFromQuaternion(quat)
    const box = new window.__THREE.Box3().setFromObject(obj)
    out.push({
      name: n,
      position: [pos.x, pos.y, pos.z].map((v) => Math.round(v * 1000) / 1000),
      rotationRad: [euler.x, euler.y, euler.z].map((v) => Math.round(v * 1000) / 1000),
      quaternion: [quat.x, quat.y, quat.z, quat.w].map((v) => Math.round(v * 1000) / 1000),
      scale: [scl.x, scl.y, scl.z].map((v) => Math.round(v * 1000) / 1000),
      boxMin: [box.min.x, box.min.y, box.min.z].map((v) => Math.round(v * 100) / 100),
      boxMax: [box.max.x, box.max.y, box.max.z].map((v) => Math.round(v * 100) / 100),
      children: (obj.children ?? []).map((c) => c.name).filter(Boolean),
    })
  })
  return out
})

mkdirSync('models-src/site1-migration', { recursive: true })
writeFileSync('models-src/site1-migration/placements.json', JSON.stringify(rows, null, 1))
console.log(`导出 ${rows.length} 个节点摆位 -> models-src/site1-migration/placements.json`)
for (const r of rows.slice(0, 12)) {
  console.log(`  ${r.name}: pos(${r.position}) scale(${r.scale})`)
}
if (rows.length > 12) console.log(`  ... 共 ${rows.length} 条`)
await browser.close()
