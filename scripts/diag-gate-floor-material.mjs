import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173/'
const OUT = '.tmp-gate-floor/material-ab'

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

const settle = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 5
        const tick = () => {
          frames -= 1
          if (frames <= 0) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )

async function analyze(path) {
  return page.evaluate(async (base64) => {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = `data:image/png;base64,${base64}`
    })
    const canvas = new OffscreenCanvas(image.width, image.height)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height).data
    let count = 0
    let sum = 0
    let max = 0
    for (let y = 460; y < image.height; y += 2) {
      for (let x = 0; x < image.width; x += 2) {
        const offset = (y * image.width + x) * 4
        const luminance =
          pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114
        if (luminance > 232) count += 1
        sum += luminance
        max = Math.max(max, luminance)
      }
    }
    return {
      brightPixels: count,
      mean: +(sum / ((image.height - 460) / 2) / (image.width / 2)).toFixed(1),
      max: +max.toFixed(1),
    }
  }, readFileSync(path).toString('base64'))
}

async function shot(name) {
  await settle()
  const path = `${OUT}/${name}.png`
  await page.screenshot({ path, timeout: 120_000 })
  const metrics = await analyze(path)
  console.log(`${name}: ${JSON.stringify(metrics)}`)
  return metrics
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(
    () =>
      window.__gltfScene &&
      window.__camera &&
      window.__teleport &&
      window.__THREE &&
      window.__playerDebug?.collision === true,
    null,
    { timeout: 600_000, polling: 1_000 },
  )
  await page.locator('button[aria-label="关闭"]').click({ force: true }).catch(() => {})
  await page.evaluate(() => document.exitPointerLock?.())

  const spawn = await page.evaluate(() => window.__camera.position.toArray())
  await page.locator('button[aria-label="切换到自动漫游"]').click({ force: true })
  await page.waitForTimeout(800)
  await page.locator('button[aria-label="切换到自主漫游"]').click({ force: true })
  await page.waitForTimeout(800)
  await page.evaluate(
    ({ eye, look }) => window.__teleport(eye, look),
    {
      eye: { x: spawn[0], y: 1.72, z: spawn[2] - 5 },
      look: { x: spawn[0] - 1.5, y: 0.9, z: spawn[2] + 7 },
    },
  )

  const materialState = await page.evaluate(() => {
    const mesh = window.__gltfScene.getObjectByName('网格209_2')
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const material = materials.find((entry) => entry?.name === '大厅地板') ?? materials[0]
    window.__floorMaterialAB = {
      mesh,
      material,
      roughness: material.roughness,
    }
    return {
      mesh: mesh.name,
      material: material.name,
      type: material.type,
      roughness: material.roughness,
      metalness: material.metalness,
      envMapIntensity: material.envMapIntensity,
      lightMap: material.lightMap?.name ?? null,
      emissiveMap: material.emissiveMap?.name ?? null,
      normalMap: material.normalMap?.name ?? null,
      roughnessMap: material.roughnessMap?.name ?? null,
    }
  })
  console.log(`material=${JSON.stringify(materialState)}`)

  const fixedMetrics = await shot('fixed-roughness-0-4')
  await page.evaluate(() => {
    window.__floorMaterialAB.material.roughness = 0
  })
  const sourceMetrics = await shot('source-roughness-0')
  await page.evaluate(() => {
    const state = window.__floorMaterialAB
    state.material.roughness = state.roughness
  })

  if (materialState.roughness < 0.4 || fixedMetrics.brightPixels >= sourceMetrics.brightPixels * 0.5) {
    throw new Error('Main-hall floor reflection regression check failed')
  }
} finally {
  await browser.close()
}
