// 扫描场景里名字带「背景」的材质，以及会被图片识别规则命中的材质，
// 确认背景墙是被哪条规则（照片命名/竖版高清/展板命名）误判的
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__THREE, null, { timeout: 300000 })

const report = await page.evaluate(() => {
  const rows = []
  const seen = new Set()
  const texSize = (t) => {
    if (!t?.image) return null
    const src = Array.isArray(t.image) ? t.image[0] : t.image
    const w = Number(src?.width) || 0
    const h = Number(src?.height) || 0
    return w && h ? `${w}x${h}` : null
  }
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (!m || seen.has(m.uuid)) continue
      seen.add(m.uuid)
      const name = m.name || '(无名)'
      const map = m.emissiveMap || m.map
      const size = texSize(map)
      const isPhotoName = /^材质(\.\d+)?$/.test(name) && size && Math.min(...size.split('x').map(Number)) >= 256
      const isBoard = ['板', '屏', '海报'].some((h) => name.includes(h)) && !name.includes('地板') && size && Math.min(...size.split('x').map(Number)) >= 512
      const isVerticalPic = (() => {
        if (!size) return false
        const [w, h] = size.split('x').map(Number)
        const rep = m.emissiveMap?.repeat || m.map?.repeat
        return w >= 512 && h >= 1024 && h > w && rep && Math.abs(rep.x - 1) <= 0.01 && Math.abs(rep.y - 1) <= 0.01
      })()
      const rule = isPhotoName ? '照片命名' : isVerticalPic ? '竖版高清' : isBoard ? '展板命名' : null
      if (name.includes('背景') || name.includes('墙') || rule) {
        rows.push({ name, map: map?.name || '', size, rule, hasEmissive: Boolean(m.emissiveMap) })
      }
    }
  })
  return rows
})

console.log('材质名 | 贴图名 | 尺寸 | 命中规则 | emissiveMap')
for (const r of report) {
  console.log(`${r.name} | ${r.map} | ${r.size} | ${r.rule ?? '-'} | ${r.hasEmissive}`)
}
console.log(`\n共 ${report.length} 条`)
await browser.close()
