// 独立展柜玻璃 A/B：原版 展厅.gltf vs 压缩 scene-0817.glb，
// 同机位拍 玻璃 材质的 5 块大玻璃，对比是否原版透亮、压缩版发黑
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : ['0817/展厅.gltf', 'scene-0817.glb']
const OUT_DIR = '.tmp-ktx/'
fs.mkdirSync(OUT_DIR, { recursive: true })

// 5 块 玻璃 材质网格的世界包围盒（scan-case-glass.mjs 实测）
const PANELS = [
  { name: 'pCube191001', center: [18.3, 1.0, -9.2] },
  { name: 'pCube178001', center: [17.3, 1.3, 3.6] },
  { name: 'polySurface68', center: [-17.9, 1.4, 3.7] },
  { name: 'polySurface193', center: [17.9, 1.4, 16.7] },
  { name: 'polySurface192', center: [-17.9, 1.4, 16.7] },
]

const browser = await chromium.launch({
  executablePath: EDGE,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

for (const model of MODELS) {
  const label = model.includes('展厅') ? 'orig' : 'comp'
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 120)))

  await page.goto(`http://localhost:5173/?model=/models/${model}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('button[aria-label="关闭"]', { timeout: 600000 })
  await page.click('button[aria-label="关闭"]', { force: true })
  await page.waitForFunction(() => window.__teleport && window.__gltfScene && window.__camera, null, { timeout: 600000 })
  await page.waitForTimeout(3000)

  // 从玻璃中心上方 3.5m、沿 -z 偏 5m 处往玻璃中心看（俯视斜角，能同时看到玻璃与后面的展品）
  for (const panel of PANELS) {
    const [cx, cy, cz] = panel.center
    await page.evaluate(([px, py, pz, tx, ty, tz]) => {
      window.__teleport({ x: px, y: py, z: pz }, { x: tx, y: ty, z: tz })
    }, [cx, cy + 2.5, cz - 6, cx, cy, cz])
    await page.waitForTimeout(2200)
    await page.screenshot({ path: `${OUT_DIR}case-${label}-${panel.name}.png`, timeout: 90000 })
    console.log(`${label}/${panel.name} 完成`)
  }
  console.log(`${label} 错误: ${errors.length ? errors.slice(0, 2).join(' | ') : '无'}`)
  await page.close()
}
await browser.close()
console.log('完成')
