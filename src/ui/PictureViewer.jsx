import { Image } from 'antd'

// 点击墙上照片后弹出的原图查看器：antd Image 预览自带缩放按钮、滚轮缩放与拖拽平移
export function PictureViewer({ photo, onClose }) {
  if (!photo) return null

  return (
    <Image
      src={photo.url}
      alt={photo.name || '照片'}
      style={{ display: 'none' }}
      preview={{
        open: true,
        onClose,
      }}
    />
  )
}
