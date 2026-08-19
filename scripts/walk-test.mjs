// 行走测试：加载模型 → 等碰撞就绪 → 前进/左转多轮，采样玩家坐标判断是否卡墙
import { chromium } from 'playwright-core'

const MODEL = process.argv[2] || 'preview-0817-compat.glb'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('console', (msg) => {
  const text = msg.text()
  if (text.includes('[perf]') || text.includes('[spawn]') || text.includes('[key]')) console.log('   ', text)
})
page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 200)))

await page.goto(`http://localhost:5173/?model=/models/${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })

// 等 collision 完成（[perf] collision 完成）或最多 60s
await page.waitForFunction(() => window.__playerDebug?.collision === true, null, { timeout: 60000 })
console.log('碰撞就绪:', JSON.stringify(await page.evaluate(() => window.__playerDebug)))

// 先点击画布中心进入交互/行走模式（部分版本需要指针锁定）
await page.mouse.click(640, 360)
await page.waitForTimeout(800)
// 再试准星开关键 E，并补一次点击
await page.keyboard.press('KeyE')
await page.waitForTimeout(500)
await page.mouse.click(640, 360)
await page.waitForTimeout(500)

const readPos = () => page.evaluate(() => window.__playerDebug)
const readFull = () => page.evaluate(() => window.__playerDebug)
let last = await readPos()
const walk = async (label, ms) => {
  await page.keyboard.down('KeyW')
  console.log('  按W时状态:', JSON.stringify(await readFull()))
  const samples = []
  for (let i = 0; i < ms / 700; i += 1) {
    await page.waitForTimeout(700)
    const pos = await readPos()
    samples.push(pos)
  }
  await page.keyboard.up('KeyW')
  const first = samples[0]
  const final = samples[samples.length - 1]
  const moved = Math.hypot(final.x - first.x, final.z - first.z)
  console.log(`${label}: 起点(${first.x},${first.z}) 终点(${final.x},${final.z}) 位移 ${moved.toFixed(2)}m ${moved < 0.5 ? '⚠️ 卡住!' : 'OK'}`)
  return final
}

const p1 = await walk('前进4s', 4000)
await page.mouse.move(640, 360)
await page.mouse.down({ button: 'right' })
await page.mouse.move(840, 360, { steps: 10 })
await page.mouse.up({ button: 'right' })
await page.waitForTimeout(600)
const p2 = await walk('右转后前进4s', 4000)
await page.mouse.move(640, 360)
await page.mouse.down({ button: 'right' })
await page.mouse.move(440, 360, { steps: 10 })
await page.mouse.up({ button: 'right' })
await page.waitForTimeout(600)
const p3 = await walk('左转后前进4s', 4000)
console.log('末状态:', JSON.stringify(await readFull()))
await page.screenshot({ path: '.tmp-ktx/walktest.png' }).catch(() => {})
await browser.close()
