// 厅门口探测：从走廊沿厅中线逐点探测碰撞，找出挡门网格
import { chromium } from 'playwright-core'

// 厅名 -> canonical 信息（来自 halls.js：tech=技术设备厅 back wall center 0）
const HALL_ARG = process.argv[2] || 'tech'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 800, height: 480 } })
page.on('console', (msg) => {
  const text = msg.text()
  if (text.includes('[perf] collision')) console.log('   ', text)
})
await page.goto('http://localhost:5173/?model=/models/preview-0817-compat.glb', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__worldLayout && window.__playerDebug?.collision === true, null, { timeout: 90000 })

const result = await page.evaluate((hallId) => {
  const layout = window.__worldLayout
  const corridorHalf = 4.8
  const HALLS = {
    care: { x: 8, z: 8.4 }, // 关怀厅 front +W/3
    broadcast: { x: 0, z: 8.4 },
    tv: { x: -8, z: 8.4 },
    cinema: { x: -8, z: -8.4 },
    tech: { x: 0, z: -8.4 },
    future: { x: 8, z: -8.4 },
  }
  const hall = HALLS[hallId]
  if (!hall) return '未知厅'
  if (!layout) return '无布局'

  // canonical -> world（复制 halls.js projectHallLayoutToWorldPosition 的仿射逻辑）
  const project = (cx, cz) => {
    const t = layout.transform
    if (t) {
      return { x: t.x[0] * cx + t.x[1] * cz + t.x[2], z: t.z[0] * cx + t.z[1] * cz + t.z[2] }
    }
    return {
      x: (layout.centerX ?? 0) + (cx * (layout.halfWidth || 12)) / 12,
      z: (layout.centerZ ?? 0) + (cz * (layout.halfDepth || 12)) / 12,
    }
  }
  const center = project(hall.x, hall.z)
  const sign = hall.z > 0 ? 1 : -1

  // 沿走廊→厅内 中线逐点探测（canonical z: 走廊 2.5 → 厅内）
  const probes = []
  for (let cz = sign * 2.5; Math.abs(cz) <= Math.abs(hall.z) + 1; cz += sign * 0.5) {
    const p = project(hall.x, cz)
    probes.push({
      cz: +cz.toFixed(1),
      x: +p.x.toFixed(1),
      z: +p.z.toFixed(1),
      blocked: window.__capsuleBlocked(p.x, p.z),
    })
  }

  // 找第一个 blocked 点，扫描哪个网格的 bbox 罩住它
  const firstBlocked = probes.find((p) => p.blocked)
  let offenders = []
  if (firstBlocked) {
    window.__gltfScene.traverse((object) => {
      if (!object.isMesh) return
      object.updateWorldMatrix(true, false)
      const geometry = object.geometry
      if (!geometry?.attributes?.position) return
      geometry.computeBoundingBox()
      const worldBox = geometry.boundingBox.clone().applyMatrix4(object.matrixWorld)
      if (
        firstBlocked.x >= worldBox.min.x - 0.3 &&
        firstBlocked.x <= worldBox.max.x + 0.3 &&
        0.4 >= worldBox.min.y &&
        1.6 <= worldBox.max.y &&
        firstBlocked.z >= worldBox.min.z - 0.3 &&
        firstBlocked.z <= worldBox.max.z + 0.3
      ) {
        const material = Array.isArray(object.material) ? object.material[0] : object.material
        offenders.push({
          name: object.name || '(未命名)',
          material: material?.name || '',
          tris: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
          size: [
            +(worldBox.max.x - worldBox.min.x).toFixed(1),
            +(worldBox.max.y - worldBox.min.y).toFixed(1),
            +(worldBox.max.z - worldBox.min.z).toFixed(1),
          ],
        })
      }
    })
    offenders = offenders.slice(0, 12)
  }

  return { center, probes, firstBlocked, offenders }
}, HALL_ARG)
console.log(JSON.stringify(result, null, 1).slice(0, 3000))
await browser.close()
