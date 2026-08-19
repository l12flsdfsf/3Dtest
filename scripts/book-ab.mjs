// 书籍展品 A/B：原版 vs 压缩版，同机位拍 pCube233（书）
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : ['0817/展厅.gltf', 'scene-0817.glb']
const OUT_DIR = '.tmp-ktx/'
fs.mkdirSync(OUT_DIR, { recursive: true })

// 书 pCube233 @(-15.2,1.1,9.7)；从东南方向看过去
const SPOTS = [
  { name: 'book-front', eye: [-13.7, 1.5, 9.7], look: [-15.2, 1.1, 9.7] },
  { name: 'book-oblique', eye: [-13.9, 1.7, 11.0], look: [-15.2, 1.05, 9.7] },
]

const browser = await chromium.launch({
  executablePath: EDGE,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
for (const model of MODELS) {
  const label = model.includes('展厅') ? 'orig' : 'comp'
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
  await page.goto(`http://localhost:5173/?model=/models/${model}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('button[aria-label="关闭"]', { timeout: 600000 })
  await page.click('button[aria-label="关闭"]', { force: true })
  await page.waitForFunction(() => window.__teleport && window.__gltfScene, null, { timeout: 600000 })
  await page.waitForTimeout(3000)
  for (const spot of SPOTS) {
    await page.evaluate(([e, l]) => window.__teleport({ x: e[0], y: e[1], z: e[2] }, { x: l[0], y: l[1], z: l[2] }), [spot.eye, spot.look])
    await page.waitForTimeout(2200)
    await page.screenshot({ path: `${OUT_DIR}book-${label}-${spot.name}.png`, timeout: 90000 })
    console.log(`${label}/${spot.name} 完成`)
  }
  await page.close()
}
await browser.close()
console.log('完成')
