// 白带材质通道实验：同一机位下依次 ①emissive 染红 ②map 置空 ③emissiveIntensity=0
// 每步截图，测白带区亮度变化 → 确定白带由哪个通道渲染
import { chromium } from 'playwright-core'
import fs from 'node:fs'

fs.mkdirSync('.tmp-ktx', { recursive: true })
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

const getMaterial = () => page.evaluate(() => {
  let material = null
  window.__gltfScene.traverse((object) => {
    if (material || !object.isMesh) return
    const mats = Array.isArray(object.material) ? object.material : [object.material]
    material = mats.find((m) => m?.name === '大厅') ?? null
  })
  window.__hallMat = material
  return material ? { name: material.name, type: material.type, hasVertexColors: material.vertexColors, emissiveIntensity: material.emissiveIntensity } : null
})
console.log('材质:', JSON.stringify(await getMaterial()))

await page.screenshot({ path: '.tmp-ktx/exp-0-base.png', timeout: 90000 })

// ① emissive 染红
await page.evaluate(() => {
  window.__hallMat.emissive.set(0xff0000)
  window.__hallMat.needsUpdate = true
})
await page.waitForTimeout(700)
await page.screenshot({ path: '.tmp-ktx/exp-1-redemissive.png', timeout: 90000 })
await page.evaluate(() => {
  window.__hallMat.emissive.set(0xffffff)
})

// ② map/emissiveMap 置空（看是否变黑/变色）
await page.evaluate(() => {
  window.__hallMat.map = null
  window.__hallMat.emissiveMap = null
  window.__hallMat.needsUpdate = true
})
await page.waitForTimeout(700)
await page.screenshot({ path: '.tmp-ktx/exp-2-nomap.png', timeout: 90000 })

// ③ 恢复贴图，关自发光
await page.evaluate(() => {
  window.__hallMat.emissiveIntensity = 0
  window.__hallMat.needsUpdate = true
})
await page.waitForTimeout(700)
await page.screenshot({ path: '.tmp-ktx/exp-3-noemissive.png', timeout: 90000 })
console.log('实验截图完成')
await browser.close()
