import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173/'

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })

page.on('console', (message) => {
  const value = message.text()
  if (value.includes('[perf]') || value.includes('[gltf]')) console.log(value)
})
page.on('pageerror', (error) => console.error('[pageerror]', String(error)))

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__worldLayout?.halls?.some((hall) => hall.id === 'tech'),
  null,
  { timeout: 600_000, polling: 1_000 },
)
await page.waitForFunction(() => typeof window.__capsuleBlocked === 'function', null, {
  timeout: 600_000,
  polling: 1_000,
})

const report = await page.evaluate(() => {
  const THREE = window.__THREE
  const halls = ['tech', 'future'].map((id) =>
    window.__worldLayout.halls.find((item) => item.id === id),
  )
  const round = (value) => +value.toFixed(2)
  const formatVector = (vector) => [round(vector.x), round(vector.y), round(vector.z)]
  const overlap = (aMin, aMax, bMin, bMax) => aMin <= bMax && aMax >= bMin

  const blockers = []
  window.__gltfScene.updateMatrixWorld(true)
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return
    const hallIds = halls
      .filter(
        (hall) =>
          overlap(box.min.x, box.max.x, hall.worldMinX, hall.worldMaxX) &&
          overlap(box.min.z, box.max.z, hall.worldMinZ, hall.worldMaxZ),
      )
      .map((hall) => hall.id)
    if (hallIds.length === 0) return
    if (!overlap(box.min.y, box.max.y, 0.02, 2.08)) return

    const materials = (Array.isArray(object.material) ? object.material : [object.material]).map(
      (material) => ({
        name: material?.name ?? '',
        visible: material?.visible !== false,
        transparent: material?.transparent === true,
        opacity: round(material?.opacity ?? 1),
        map: material?.map?.name ?? '',
      }),
    )
    const geometry = object.geometry
    const triangles = geometry?.index
      ? geometry.index.count / 3
      : (geometry?.attributes?.position?.count ?? 0) / 3
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    blockers.push({
      name: object.name,
      hallIds,
      visible: object.visible,
      triangles: Math.round(triangles),
      center: formatVector(center),
      size: formatVector(size),
      min: formatVector(box.min),
      max: formatVector(box.max),
      materials,
    })
  })

  blockers.sort((a, b) => b.size[0] * b.size[2] - a.size[0] * a.size[2])

  const capsule = {
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    radius: 0.35,
    getCenter(target) {
      return target.copy(this.end).add(this.start).multiplyScalar(0.5)
    },
  }
  const hasHorizontalCollision = (x, z) => {
    capsule.start.set(x, 0.37, z)
    capsule.end.set(x, 1.6, z)
    const hit = window.__collisionWorld.capsuleIntersect(capsule)
    return Boolean(hit && Math.abs(hit.normal.y) < 0.5)
  }

  const resolveHorizontalCollision = (position) => {
    capsule.start.set(position.x, 0.37, position.z)
    capsule.end.set(position.x, 1.6, position.z)
    const hit = window.__collisionWorld.capsuleIntersect(capsule)
    if (!hit) return false
    const horizontalLength = Math.hypot(hit.normal.x, hit.normal.z)
    if (horizontalLength < 1e-4) return false
    position.x += (hit.normal.x * hit.depth) / horizontalLength
    position.z += (hit.normal.z * hit.depth) / horizontalLength
    return true
  }

  const pushTests = halls.map((hall) => {
    const position = {
      x: (hall.worldMinX + hall.worldMaxX) / 2,
      z: (hall.worldMinZ + hall.worldMaxZ) / 2,
    }
    const samples = []
    let collisions = 0
    for (let step = 0; step < 240; step += 1) {
      position.x += 0.04
      if (resolveHorizontalCollision(position)) collisions += 1
      samples.push({ x: position.x, z: position.z })
    }
    const tail = samples.slice(-40)
    const xs = tail.map((sample) => sample.x)
    const zs = tail.map((sample) => sample.z)
    return {
      id: hall.id,
      collisions,
      final: { x: round(position.x), z: round(position.z) },
      tailSpread: {
        x: round(Math.max(...xs) - Math.min(...xs)),
        z: round(Math.max(...zs) - Math.min(...zs)),
      },
      insideHall:
        position.x >= hall.worldMinX &&
        position.x <= hall.worldMaxX &&
        position.z >= hall.worldMinZ &&
        position.z <= hall.worldMaxZ,
    }
  })

  const spacing = 0.4
  const hallReports = halls.map((hall) => {
    const cols = Math.floor((hall.worldMaxX - hall.worldMinX) / spacing) + 1
    const rows = Math.floor((hall.worldMaxZ - hall.worldMinZ) / spacing) + 1
    const grid = []
    let blockedCount = 0
    for (let row = rows - 1; row >= 0; row -= 1) {
      let text = ''
      const z = hall.worldMinZ + row * spacing
      for (let col = 0; col < cols; col += 1) {
        const x = hall.worldMinX + col * spacing
        const blocked = hasHorizontalCollision(x, z)
        blockedCount += blocked ? 1 : 0
        text += blocked ? '#' : '.'
      }
      grid.push(`${round(z).toFixed(2)} ${text}`)
    }
    return {
      id: hall.id,
      bounds: {
        minX: round(hall.worldMinX),
        maxX: round(hall.worldMaxX),
        minZ: round(hall.worldMinZ),
        maxZ: round(hall.worldMaxZ),
        sizeX: round(hall.worldMaxX - hall.worldMinX),
        sizeZ: round(hall.worldMaxZ - hall.worldMinZ),
      },
      grid: { spacing, cols, rows, blockedCount, lines: grid },
    }
  })

  const normalizedPcube178 = []
  window.__gltfScene.traverse((object) => {
    const key = String(object.name ?? '').replace(/[._-]/g, '').toLowerCase()
    if (key.includes('pcube178')) normalizedPcube178.push(object.name)
  })

  return {
    halls: hallReports,
    pushTests,
    pcube178: normalizedPcube178,
    meshes: blockers,
  }
})

for (const hall of report.halls) {
  console.log(`\n${hall.id.toUpperCase()} HALL`, JSON.stringify(hall.bounds))
  console.log(`COLLISION GRID spacing=${hall.grid.spacing} blocked=${hall.grid.blockedCount}`)
  console.log(hall.grid.lines.join('\n'))
}
console.log('\nPUSH STABILITY', JSON.stringify(report.pushTests))
console.log('\npCube178 descendants still in scene:', JSON.stringify(report.pcube178))
console.log('\nPLAYER-HEIGHT MESHES')
for (const mesh of report.meshes) {
  if (mesh.size[0] >= 2 || mesh.size[2] >= 2) console.log(JSON.stringify(mesh))
}

await browser.close()
