// 验证恢复后自动漫游正常推进：用 rAF promise 驱动帧
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__playerDebug?.collision === true, null, { timeout: 120000 })

const state = () => page.evaluate(() => ({ x: +window.__camera.position.x.toFixed(2), z: +window.__camera.position.z.toFixed(2), ...window.__autoRoamDebug }))
// 等 N 个 rAF 帧（超时则返回 -1）
const frames = (n) => page.evaluate((n) => new Promise((resolve) => {
  let count = 0
  const tick = () => (count += 1) >= n ? resolve(count) : requestAnimationFrame(tick)
  requestAnimationFrame(tick)
  setTimeout(() => resolve(-1), 8000)
}), n)

await page.click('button[aria-label="切换到自动漫游"]', { force: true })
console.log(`rAF 可用性: ${await frames(30)}`)
await frames(120)
console.log(`跑一段后: ${JSON.stringify(await state())}`)

await page.click('button[aria-label="切换到自主漫游"]', { force: true })
await frames(30)
console.log(`切回手动: ${JSON.stringify(await state())}`)

await page.click('button[aria-label="切换到自动漫游"]', { force: true })
for (let i = 0; i < 5; i += 1) {
  await frames(40)
  const s = await state()
  console.log(`恢复后样本${i}: idx=${s.index} prog=${s.progress} pause=${s.pause} pos=(${s.x},${s.z})`)
}
const final = await state()
console.log(final.progress > 0.05 || final.index > 0 ? 'PASS: 恢复后自动漫游在推进' : 'FAIL: 恢复后未推进')
await browser.close()
