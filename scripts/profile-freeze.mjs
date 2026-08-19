// CPU 采样剖析：找出解析阶段主线程卡死在哪个函数
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const MODEL = process.argv[2] || 'preview-0817-compat.glb'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
const cdp = await page.context().newCDPSession(page)

await page.goto(`http://localhost:5173/?model=/models/${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
await cdp.send('Profiler.start')
console.log('采样中（等待 60 秒）…')
await page.waitForTimeout(60000)

const { profile } = await cdp.send('Profiler.stop').catch(() => ({ profile: null }))
if (!profile) {
  console.log('Profiler 无法停止（渲染进程可能已死）')
} else {
  // 聚合每个函数的自耗时
  const nodes = new Map()
  for (const node of profile.nodes) nodes.set(node.id, node)
  const selfTime = new Map()
  const totalSamples = profile.samples?.length || 0
  for (const id of profile.samples || []) selfTime.set(id, (selfTime.get(id) || 0) + 1)
  const rows = [...selfTime.entries()]
    .map(([id, count]) => {
      const node = nodes.get(id)
      const frame = node?.callFrame || {}
      return {
        fn: `${frame.functionName || '(匿名)'} @ ${(frame.url || '').split('/').pop()}:${frame.lineNumber + 1}`,
        pct: (100 * count) / Math.max(1, totalSamples),
      }
    })
  const merged = new Map()
  for (const row of rows) merged.set(row.fn, (merged.get(row.fn) || 0) + row.pct)
  const top = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  console.log(`总采样 ${totalSamples}，热点函数（自耗时占比%）:`)
  for (const [fn, pct] of top) console.log(`  ${pct.toFixed(1)}%  ${fn}`)
  fs.writeFileSync('.tmp-ktx/cpu-profile.json', JSON.stringify(profile))
  console.log('完整 profile 已存 .tmp-ktx/cpu-profile.json')
}
await browser.close()
