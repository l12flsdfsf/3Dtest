// 光晕对照实验：站在能拍到光晕的机位，依次关闭 ①大厅材质自发光 ②镜面强度，
// 每步截图对比，确定光晕来源
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

// 机位：面对进门右侧墙/门框区域（光晕点 [9.4,3.5,8.9]）
const setView = () => page.evaluate(() => {
  window.__teleport({ x: 4, y: 1.7, z: 13.5 }, { x: 9.4, y: 3.4, z: 8.9 })
})
await setView()
await page.waitForTimeout(2200)
await page.screenshot({ path: '.tmp-ktx/halo-test-base.png', timeout: 90000 })
console.log('基准截图完成')

// ① 关自发光
await page.evaluate(() => {
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    const mats = Array.isArray(object.material) ? object.material : [object.material]
    for (const m of mats) if (m?.name === '大厅') m.emissiveIntensity = 0
  })
})
await page.waitForTimeout(800)
await page.screenshot({ path: '.tmp-ktx/halo-test-noemissive.png', timeout: 90000 })
console.log('关自发光截图完成')

// ② 恢复自发光，关镜面
await page.evaluate(() => {
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    const mats = Array.isArray(object.material) ? object.material : [object.material]
    for (const m of mats) {
      if (m?.name !== '大厅') continue
      m.emissiveIntensity = 1
      if (m.specularIntensity !== undefined) m.specularIntensity = 0
    }
  })
})
await page.waitForTimeout(800)
await page.screenshot({ path: '.tmp-ktx/halo-test-nospecular.png', timeout: 90000 })
console.log('关镜面截图完成')
await browser.close()
