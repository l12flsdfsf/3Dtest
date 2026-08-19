// 对根场景（不只 __gltfScene）射线：找白带处最先命中的对象（可能是模型外的东西）
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
  let root = window.__gltfScene
  while (root.parent) root = root.parent
  window.__root = root

  // 根场景里、不在 __gltfScene 里的网格清单
  const outside = []
  root.traverse((object) => {
    if (!object.isMesh) return
    let p = object.parent
    let inModel = false
    while (p) {
      if (p === window.__gltfScene) { inModel = true; break }
      p = p.parent
    }
    if (!inModel) {
      const box = new window.__THREE.Box3().setFromObject(object)
      outside.push({
        name: object.name,
        type: object.type,
        material: Array.isArray(object.material) ? object.material.map((m) => m?.type).join(',') : object.type,
        box: box.isEmpty() ? null : [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map((v) => +v.toFixed(1)),
      })
    }
  })

  // 白带 NDC 处，根场景射线的全部命中（按距离排序取前3）
  const probes = []
  for (const [nx, ny] of [[0.7, 0.3], [0.75, 0.25], [0.68, 0.2], [0.8, 0.28]]) {
    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2(nx, ny), window.__camera)
    const hits = raycaster.intersectObject(root, true)
    probes.push({
      nx, ny,
      top3: hits.slice(0, 3).map((h) => {
        const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
        const mat = mats[h.face?.materialIndex ?? 0] ?? mats[0]
        return {
          mesh: h.object.name,
          material: mat?.name ?? '(unnamed)',
          matType: mat?.type,
          color: mat?.color ? `#${mat.color.getHexString()}` : '',
          dist: +h.distance.toFixed(2),
        }
      }),
    })
  }
  return { outsideCount: outside.length, outside: outside.slice(0, 20), probes }
})
console.log('根场景中非模型的网格数:', result.outsideCount)
for (const o of result.outside) console.log(' ', JSON.stringify(o))
console.log('=== 白带 NDC 根场景射线前3命中 ===')
for (const p of result.probes) {
  console.log(`NDC(${p.nx},${p.ny}):`)
  for (const h of p.top3) console.log('  ', JSON.stringify(h))
}
await browser.close()
