// 找西墙前段（x≈-9.7, z 18~25.5）的展陈网格名/材质名（无尺寸过滤）
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 400, height: 300 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__THREE, null, { timeout: 180000 })
await page.waitForTimeout(2000)

const rows = await page.evaluate(() => {
  const THREE = window.__THREE
  const out = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty()) return
    // 西侧墙前段：x -10.3~-9.2，z 18~25.5（不含前墙 z24.7 上的证书框）
    if (box.max.x < -9.2 || box.min.x > -8.6) return
    if (box.max.z < 18 || box.min.z > 25.5) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    out.push({
      mesh: o.name.slice(0, 36),
      ud: typeof o.userData?.name === 'string' ? o.userData.name.slice(0, 20) : '',
      mat: mats.map((m) => m?.name).filter(Boolean).slice(0, 2).join('|'),
      box: [
        +box.min.x.toFixed(2), +box.min.y.toFixed(2), +box.min.z.toFixed(2),
        +box.max.x.toFixed(2), +box.max.y.toFixed(2), +box.max.z.toFixed(2),
      ],
    })
  })
  return out
})
rows.sort((a, b) => a.box[2] - b.box[2] || a.box[1] - b.box[1]).forEach((r) =>
  console.log(r.mesh.padEnd(36), (r.ud ? `ud:${r.ud} ` : '').padEnd(24), ('[' + r.mat + ']').padEnd(22), r.box.join(',')))
await browser.close()
