// 行亮度差：对比 on/off 截图，定位阴影系统在画面哪些行产生变化
import sharp from 'sharp'

const pair = async (onPath, offPath, label) => {
  const [onRaw, offRaw] = await Promise.all([
    sharp(onPath).greyscale().raw().toBuffer({ resolveWithObject: true }),
    sharp(offPath).greyscale().raw().toBuffer({ resolveWithObject: true }),
  ])
  const { width, height } = onRaw.info
  console.log(`\n== ${label} (${width}x${height}) ==`)
  const diffs = []
  for (let y = 0; y < height; y += 2) {
    let sum = 0
    for (let x = 0; x < width; x += 2) {
      sum += onRaw.data[y * width + x] - offRaw.data[y * width + x]
    }
    diffs.push({ y, mean: sum / (width / 2) })
  }
  const maxAbs = Math.max(...diffs.map((d) => Math.abs(d.mean)))
  diffs
    .filter((d) => Math.abs(d.mean) > Math.max(1.2, maxAbs * 0.08))
    .forEach((d) => console.log(`row ${String(d.y).padStart(4)} (${(d.y / height * 100).toFixed(0)}%) diff=${d.mean.toFixed(1)}`))
  console.log(`max row |diff| = ${maxAbs.toFixed(1)}`)
}

await pair('.tmp-ktx/ab-up-close-on.png', '.tmp-ktx/ab-up-close-off.png', 'up-close: shadows ON vs OFF')
await pair('.tmp-ktx/ab-up-close-on.png', '.tmp-ktx/ab-up-close-noover.png', 'up-close: overlays ON vs hidden')
await pair('.tmp-ktx/ab-left-corner-on.png', '.tmp-ktx/ab-left-corner-off.png', 'left-corner: ON vs OFF')
await pair('.tmp-ktx/ab-right-corner-on.png', '.tmp-ktx/ab-right-corner-off.png', 'right-corner: ON vs OFF')
