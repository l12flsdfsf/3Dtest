// 一锤定音：隐藏 网格209 后白带是否消失；再换纯红 BasicMaterial 验证
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
await page.screenshot({ path: '.tmp-ktx/hm-0-base.png', timeout: 90000 })

// ① 隐藏 网格209
const found = await page.evaluate(() => {
  let n = 0
  window.__gltfScene.traverse((object) => {
    if (object.name === '网格209') { object.visible = false; n += 1 }
  })
  return n
})
console.log('隐藏 网格209 ×', found)
await page.waitForTimeout(700)
await page.screenshot({ path: '.tmp-ktx/hm-1-hidden.png', timeout: 90000 })

// ② 恢复显示，材质换成纯红 Basic
await page.evaluate(() => {
  const { MeshBasicMaterial } = window.__THREE
  window.__gltfScene.traverse((object) => {
    if (object.name !== '网格209') return
    object.visible = true
    if (!object.userData._origMat) {
      object.userData._origMat = object.material
      object.material = Array.isArray(object.material)
        ? object.material.map(() => new MeshBasicMaterial({ color: 0xff0000 }))
        : new MeshBasicMaterial({ color: 0xff0000 })
    }
  })
})
console.log('网格209 材质换成纯红 Basic')
await page.waitForTimeout(700)
await page.screenshot({ path: '.tmp-ktx/hm-2-redbasic.png', timeout: 90000 })
await browser.close()
