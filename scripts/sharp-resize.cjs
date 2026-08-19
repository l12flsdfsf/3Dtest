// 独立进程的 sharp 缩放工具（主进程内 sharp 会触发 libvips colourspace 崩溃，隔离进程从未复现）
// 用法: node scripts/sharp-resize.cjs <input> <output> <width> <height> [png|jpg] [quality]
const sharp = require('sharp')
const fs = require('fs')

const [input, output, widthArg, heightArg, format = 'png', qualityArg] = process.argv.slice(2)
const width = Number(widthArg)
const height = Number(heightArg)

let pipeline = sharp(fs.readFileSync(input), { limitInputPixels: true }).resize(width, height, {
  fit: 'fill',
  kernel: 'lanczos3',
})
if (format === 'jpg') {
  pipeline = pipeline.jpeg({ quality: Number(qualityArg) || 88, mozjpeg: true })
} else {
  pipeline = pipeline.png()
}

pipeline
  .toBuffer()
  .then((buffer) => {
    fs.writeFileSync(output, buffer)
    process.exit(0)
  })
  .catch((error) => {
    console.error(String(error && error.message ? error.message : error).split('\n')[0])
    process.exit(1)
  })
