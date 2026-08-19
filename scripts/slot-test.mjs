// 逐材质槽染色：网格209 的每个材质槽依次染红，找出控制白带的槽位
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
await page.screenshot({ path: '.tmp-ktx/slot-0-base.png', timeout: 90000 })

const info = await page.evaluate(() => {
  let mesh = null
  window.__gltfScene.traverse((object) => {
    if (mesh || object.name !== '网格209') return
    mesh = object
  })
  window.__mesh209 = mesh
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const groups = mesh.geometry.groups ?? []
  return {
    single: !Array.isArray(mesh.material),
    slots: mats.map((m, i) => ({
      i,
      name: m?.name ?? '(unnamed)',
      type: m?.type,
      color: m?.color ? `#${m.color.getHexString()}` : '',
      emissive: m?.emissive ? `#${m.emissive.getHexString()}` : '',
      emissiveIntensity: m?.emissiveIntensity,
      map: m?.map?.name ?? (m?.map ? '(map)' : ''),
      groups: groups.filter((g) => g.materialIndex === i).length,
    })),
  }
})
console.log('网格209 材质槽数:', info.slots.length, info.single ? '(单材质)' : '')
for (const s of info.slots) console.log(JSON.stringify(s))

for (const slot of info.slots) {
  await page.evaluate((i) => {
    const mesh = window.__mesh209
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (mats[i]) {
      window.__origColor = window.__origColor ?? []
      window.__origColor[i] = mats[i].color ? mats[i].color.getHex() : null
      if (mats[i].color) {
        mats[i].color.set(0xff0000)
        mats[i].needsUpdate = true
      }
    }
  }, slot.i)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `.tmp-ktx/slot-${slot.i + 1}-red.png`, timeout: 90000 })
  // 还原
  await page.evaluate((i) => {
    const mesh = window.__mesh209
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (mats[i]?.color && window.__origColor?.[i] != null) {
      mats[i].color.setHex(window.__origColor[i])
      mats[i].needsUpdate = true
    }
  }, slot.i)
  await page.waitForTimeout(400)
}
console.log('逐槽染色完成')
await browser.close()
