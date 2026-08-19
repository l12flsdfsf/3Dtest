// 验证：场景里有多少个名为「大厅」的材质实例；直接染 mesh209.material 本体
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
await page.screenshot({ path: '.tmp-ktx/it-0-base.png', timeout: 90000 })

const info = await page.evaluate(() => {
  const instances = new Map()
  let mesh209 = null
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    if (object.name === '网格209' && !mesh209) mesh209 = object
    const mats = Array.isArray(object.material) ? object.material : [object.material]
    for (const m of mats) {
      if (m?.name === '大厅') {
        if (!instances.has(m.uuid)) instances.set(m.uuid, { uuid: m.uuid.slice(0, 8), meshes: [] })
        instances.get(m.uuid).meshes.push(object.name)
      }
    }
  })
  window.__mesh209 = mesh209
  const list = [...instances.values()].map((v) => ({ ...v, meshCount: v.meshes.length, sample: v.meshes.slice(0, 6) }))
  const m209mat = mesh209.material
  return {
    instanceCount: list.length,
    instances: list,
    mesh209MaterialUUID: m209mat.uuid.slice(0, 8),
    mesh209MaterialIsFirstInstance: list[0] ? list[0].uuid === m209mat.uuid.slice(0, 8) : false,
  }
})
console.log('「大厅」材质实例数:', info.instanceCount)
console.log(JSON.stringify(info.instances, null, 1))
console.log('mesh209 材质 UUID:', info.mesh209MaterialUUID, '是否第一个实例:', info.mesh209MaterialIsFirstInstance)

// 直接对 mesh209.material 本体染红
await page.evaluate(() => {
  window.__mesh209.material.color.set(0xff0000)
  window.__mesh209.material.needsUpdate = true
})
await page.waitForTimeout(700)
await page.screenshot({ path: '.tmp-ktx/it-1-red.png', timeout: 90000 })
console.log('直接染红完成')
await browser.close()
