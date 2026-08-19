// 决定性实验：material.color 染红 → 白带变不变？不变=白带根本不走该材质的着色
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
await page.screenshot({ path: '.tmp-ktx/cf-0-base.png', timeout: 90000 })

const out = await page.evaluate(() => {
  const results = []
  let hallMat = null
  window.__gltfScene.traverse((object) => {
    if (hallMat || !object.isMesh) return
    const mats = Array.isArray(object.material) ? object.material : [object.material]
    hallMat = mats.find((m) => m?.name === '大厅') ?? null
  })
  // 大厅材质染红
  hallMat.color.set(0xff3030)
  hallMat.needsUpdate = true
  results.push('color=red 已设置')
  return results
})
console.log(out.join('; '))
await page.waitForTimeout(700)
await page.screenshot({ path: '.tmp-ktx/cf-1-redcolor.png', timeout: 90000 })

// 同时也把黑色门框(展望厅)材质描个颜色，确认它存在感
await page.evaluate(() => {
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    const mats = Array.isArray(object.material) ? object.material : [object.material]
    for (const m of mats) if (m?.name === '展望厅') { m.color.set(0x30ff30); m.needsUpdate = true }
  })
})
await page.waitForTimeout(700)
await page.screenshot({ path: '.tmp-ktx/cf-2-both.png', timeout: 90000 })
console.log('染色实验截图完成')
await browser.close()
