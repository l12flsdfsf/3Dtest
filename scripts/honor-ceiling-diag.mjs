// 诊断：荣誉墙/荣誉篇章天花压暗线 + 大门门槛竖向阴影来源
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__camera && window.__THREE
    && window.__mainHallCornerShadows && window.__mainHallCeilingShadows,
  null,
  { timeout: 180000 },
)
await page.waitForTimeout(2500)

// 1) 天花压暗线 + 墙角缝
const state = await page.evaluate(() => {
  const fmt = (v) => +v.toFixed(2)
  const lines = window.__mainHallCeilingShadows?.lines
  const junctions = window.__mainHallCornerShadows?.junctions?.map((j) => [fmt(j.x), fmt(j.y), fmt(j.z), fmt(j.w)])
  return {
    topX: lines?.topX,
    topZ: lines?.topZ,
    junctions,
  }
})
console.log('== ceiling lines topX ==')
state.topX.forEach((l) => console.log(` coord=${l.coord} span=[${l.span.join(', ')}] sign=${l.sign}`))
console.log('== ceiling lines topZ ==')
state.topZ.forEach((l) => console.log(` coord=${l.coord} span=[${l.span.join(',  ')}] sign=${l.sign}`))
console.log('== corner junctions (x, z, fx, fz) ==')
state.junctions.forEach((j) => console.log(' ', j.join(', ')))

// 2) 荣誉墙 / 荣誉篇章 / 奖杯 相关网格包围盒
const labels = await page.evaluate(() => {
  const THREE = window.__THREE
  const rows = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const names = [o.name, o.userData?.name, ...mats.map((m) => m?.name)]
      .filter((n) => typeof n === 'string' && n)
    if (!names.some((n) => /荣誉篇章|荣誉墙|奖杯|大门/.test(n))) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty()) return
    rows.push({
      mesh: names[0].slice(0, 40),
      mat: mats.map((m) => m?.name).filter(Boolean).slice(0, 3).join('|'),
      box: [
        +box.min.x.toFixed(2), +box.min.y.toFixed(2), +box.min.z.toFixed(2),
        +box.max.x.toFixed(2), +box.max.y.toFixed(2), +box.max.z.toFixed(2),
      ],
    })
  })
  return rows
})
console.log('== honor/door meshes ==')
labels.forEach((r) => console.log(`${r.mesh} [${r.mat}] box=${r.box.join(',')}`))

await browser.close()
