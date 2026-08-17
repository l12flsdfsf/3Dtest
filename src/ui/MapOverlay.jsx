import { useEffect } from 'react'
import { FloorMap } from './FloorMap.jsx'
import { OverlayPanel } from './OverlayPanel.jsx'
import { RAW_FIGMA_EXPORTS } from '../data/assets.js'

// 展厅地图浮层：查看六个分厅的位置与「你在此」定位；点击分厅可传送过去
export function MapOverlay({ open, currentHall, onClose, onHallClick }) {
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <OverlayPanel
      backgroundSrc={RAW_FIGMA_EXPORTS.cPanel3}
      title={'展厅地图'}
      subtitle={'查看六个分厅的位置与推荐游览路线'}
      onClose={onClose}
    >
      <div className="flex h-full w-full items-center justify-center pt-[6%]">
        <FloorMap currentHall={currentHall} onHallClick={onHallClick} />
      </div>

      <div className="pointer-events-none absolute bottom-[8.5%] left-[6.6%] flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 shadow-[0_2px_8px_rgba(15,23,42,0.12)] ring-1 ring-slate-200">
        <span
          className="rounded-full"
          style={{
            width: 'calc(min(48vh, 480px) / 28)',
            height: 'calc(min(48vh, 480px) / 28)',
            backgroundColor: '#2563eb',
            boxShadow: '0 0 0 calc(min(48vh, 480px) * 6 / 280) rgba(37, 99, 235, 0.16)',
          }}
        />
        <span className="text-[14px] font-medium leading-6 text-slate-600">当前位置</span>
      </div>
    </OverlayPanel>
  )
}
