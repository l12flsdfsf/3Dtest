// 法线贴图 G 通道反转（OpenGL↔DirectX 法线约定互转）
// 独立进程运行：sharp 在 bake 主进程内会触发 libvips colourspace 崩溃（同 compress-ktx2 的坑）
// 用法: node scripts/site1-invert-g.cjs <图片1> [图片2 ...]  （原地覆盖，统一输出 PNG）
const sharp = require('sharp')

async function invertG(file) {
  const { data, info } = await sharp(file, { failOn: 'none' })
    .ensureAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  // RGBA: G 在每个像素第 2 字节
  for (let i = 1; i < data.length; i += 4) data[i] = 255 - data[i]
  const out = file.replace(/\.(jpe?g|png)$/i, '.ginv.png')
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toFile(out)
  return out
}

for (const file of process.argv.slice(2)) {
  invertG(file)
    .then((out) => console.log(`${file} -> ${out}`))
    .catch((error) => {
      console.error(`${file} 失败: ${error.message}`)
      process.exitCode = 1
    })
}
