// 调参验证：书柜 / 初始视角 / 大屏正面（'1屏' 材质网格，按法线站位）
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const OUT_DIR = '.tmp-ktx/'
fs.mkdirSync(OUT_DIR, { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true })
await page.waitForFunction(() => window.__teleport && window.__gltfScene && window.__screenVideo, null, { timeout: 120000 })
await page.waitForTimeout(4000)

// 初始视角
await page.screenshot({ path: `${OUT_DIR}tune-spawn.png`, timeout: 90000 })
console.log('spawn 完成')

// 大屏正面：找 '1屏' 材质网格，沿首面法线站 4m
const screen = await page.evaluate(() => {
  const { Box3, Vector3 } = window.__THREE
  let found = null
  window.__gltfScene.traverse((object) => {
    if (found || !object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some((m) => m?.name === '1屏')) return
    const box = new Box3().setFromObject(object)
    const center = box.getCenter(new Vector3())
    const geometry = object.geometry
    const normal = geometry.attributes.normal
    const index = geometry.index
    let n = new Vector3(0, 0, 1)
    if (normal && (index ? index.count : normal.count) >= 3) {
      const [i0, i1, i2] = index ? [index.getX(0), index.getX(1), index.getX(2)] : [0, 1, 2]
      const a = new Vector3(normal.getX(i0), normal.getY(i0), normal.getZ(i0))
      const b = new Vector3(normal.getX(i1), normal.getY(i1), normal.getZ(i1))
      const c = new Vector3(normal.getX(i2), normal.getY(i2), normal.getZ(i2))
      n = b.sub(a).cross(c.sub(a)).normalize()
    }
    n.transformDirection(object.matrixWorld).normalize()
    found = { center: center.toArray(), normal: n.toArray() }
  })
  return found
})
if (screen) {
  const [cx, cy, cz] = screen.center
  await page.evaluate(([px, py, pz, tx, ty, tz]) => {
    window.__teleport({ x: px, y: py, z: pz }, { x: tx, y: ty, z: tz })
  }, [cx + screen.normal[0] * 4.5, 1.55, cz + screen.normal[2] * 4.5, cx, cy, cz])
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT_DIR}tune-screen.png`, timeout: 90000 })
  console.log('screen 完成')
} else {
  console.log('未找到 1屏 网格')
}

// 书柜
await page.evaluate(() => window.__teleport({ x: -13.9, y: 1.7, z: 11.0 }, { x: -15.2, y: 1.05, z: 9.7 }))
await page.waitForTimeout(2200)
await page.screenshot({ path: `${OUT_DIR}tune-book.png`, timeout: 90000 })
console.log('book 完成')
await browser.close()
