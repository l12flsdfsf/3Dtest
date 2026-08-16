import { useCallback, useEffect, useState } from 'react'
import FullscreenOutlined from '@ant-design/icons/FullscreenOutlined'
import FullscreenExitOutlined from '@ant-design/icons/FullscreenExitOutlined'

const FULLSCREEN_SUPPORTED =
  typeof document !== 'undefined' &&
  Boolean(
    document.documentElement.requestFullscreen ||
      document.documentElement.webkitRequestFullscreen,
  )

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
}

export function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(() => Boolean(getFullscreenElement()))

  useEffect(() => {
    const syncState = () => setFullscreen(Boolean(getFullscreenElement()))
    document.addEventListener('fullscreenchange', syncState)
    document.addEventListener('webkitfullscreenchange', syncState)
    return () => {
      document.removeEventListener('fullscreenchange', syncState)
      document.removeEventListener('webkitfullscreenchange', syncState)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    try {
      if (getFullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        Promise.resolve(exit ? exit.call(document) : undefined).catch(() => {})
        return
      }

      const root = document.documentElement
      const request = root.requestFullscreen || root.webkitRequestFullscreen
      Promise.resolve(request ? request.call(root) : undefined).catch(() => {})
    } catch {
      // 浏览器拒绝全屏请求时静默忽略
    }
  }, [])

  if (!FULLSCREEN_SUPPORTED) {
    return null
  }

  const label = fullscreen ? '退出全屏' : '全屏'

  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      title={label}
      className="nav-button absolute bottom-8 left-8 z-30 inline-flex items-center gap-2"
    >
      {fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
      <span>{label}</span>
    </button>
  )
}
