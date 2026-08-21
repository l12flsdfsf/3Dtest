// 从机位向天花靠近交界处打射线，查可见面到底是哪个网格/材质
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__THREE && window.__mainHallCeilingShadows, null, { timeout: 180000 })
await page.waitForTimeout(2000)

const hits = await page.evaluate(() => {
  const THREE = window.__THREE
  const cam = window.__camera
  cam.up.set(0, 1, 0)
  cam.position.set(-7.6, 1.72, -13.4)
  cam.lookAt(new THREE.Vector3(-6.4, 4.9, -17))
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()

  const raycaster = new THREE.Raycaster()
  const out = []
  // 竖着扫交界带（ndcY 0.05~0.40 对应屏幕下半的天花带与墙上沿）
  for (let i = 0; i <= 12; i++) {
    const ndcY = 0.05 + (0.35 * i) / 12
    raycaster.setFromCamera(new THREE.Vector2(0.5, ndcY), cam)
    const hitList = raycaster.intersectObject(window.__gltfScene, true).slice(0, 2)
    out.push({
      ndcY: +ndcY.toFixed(3),
      row: Math.round(((1 - ndcY) / 2) * 720),
      hits: hitList.map((h) => {
        const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
        const m = Number.isInteger(h.face?.materialIndex) ? mats[h.face.materialIndex] : mats[0]
        return `${h.object.name}[${m?.name ?? '?'}] ny=${h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).y.toFixed(2) : '?'} y=${h.point.y.toFixed(2)}`
      }),
    })
  }
  return out
})
for (const row of hits) console.log(`ndcY=${row.ndcY} row~${row.row}`, row.hits.join(' | ') || '(no hit)')
await browser.close()
