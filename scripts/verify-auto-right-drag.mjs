import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })

const state = () =>
  page.evaluate(() => ({
    x: window.__camera?.position.x ?? 0,
    z: window.__camera?.position.z ?? 0,
    quaternion: window.__camera?.quaternion.toArray() ?? [],
    auto: window.__autoRoamDebug ?? {},
  }))

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const quaternionDistance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]))

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300_000 })
  await page.click('button[aria-label="关闭"]', { force: true })
  await page.waitForFunction(() => window.__camera && window.__playerDebug?.collision === true, null, {
    timeout: 120_000,
  })

  await page.click('button[aria-label="切换到自动漫游"]', { force: true })
  await page.waitForFunction(
    () => window.__autoRoamDebug?.progress > 0.03 || window.__autoRoamDebug?.index > 0,
    null,
    { timeout: 30_000 },
  )

  await page.mouse.move(480, 270)
  await page.mouse.down({ button: 'right' })
  await page.waitForFunction(() => window.__autoRoamDebug?.pausedForManualLook === true)
  const pausedStart = await state()

  await page.mouse.move(650, 220, { steps: 8 })
  await page.waitForTimeout(500)
  const dragging = await state()

  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(1_000)
  const waiting = await state()

  await page.waitForTimeout(2_300)
  const afterDelay = await state()
  if (afterDelay.auto.pausedForManualLook) {
    throw new Error(JSON.stringify({ pausedAfterDelay: afterDelay.auto, waiting: waiting.auto }))
  }

  await page.waitForTimeout(700)
  const resumed = await state()

  const stationaryWhileDragging = distance(pausedStart, dragging) < 0.01
  const stationaryDuringDelay = distance(dragging, waiting) < 0.01
  const lookChanged = quaternionDistance(pausedStart.quaternion, dragging.quaternion) > 0.01
  const resumedMovement = distance(waiting, resumed) > 0.01

  if (!stationaryWhileDragging || !stationaryDuringDelay || !lookChanged || !resumedMovement) {
    throw new Error(
      JSON.stringify({
        stationaryWhileDragging,
        stationaryDuringDelay,
        lookChanged,
        resumedMovement,
        pausedStart,
        dragging,
        waiting,
        resumed,
      }),
    )
  }

  console.log('PASS: 自动漫游右键接管视角并在 2 秒无操作后恢复')
} finally {
  await browser.close()
}
