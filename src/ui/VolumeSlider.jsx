import { useCallback, useRef } from 'react'
import { RAW_FIGMA_EXPORTS } from '../data/assets.js'

const PANEL_W = 88
const PANEL_H = 207
const TRACK_W = 12
const TRACK_H = 116
const TRACK_LEFT = (PANEL_W - TRACK_W) / 2
const TRACK_TOP = Math.round((PANEL_H - TRACK_H) / 2)
const THUMB_SIZE = 40
const THUMB_LEFT = (PANEL_W - THUMB_SIZE) / 2

export function VolumeSlider({ value = 60, onChange }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)

  const updateFromClientY = useCallback(
    (clientY) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ratio = 1 - (clientY - rect.top) / rect.height
      const next = Math.round(Math.min(1, Math.max(0, ratio)) * 100)
      if (onChange) onChange(next)
    },
    [onChange],
  )

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      draggingRef.current = true
      updateFromClientY(e.clientY)

      const onMove = (ev) => {
        if (!draggingRef.current) return
        updateFromClientY(ev.clientY)
      }
      const onUp = () => {
        draggingRef.current = false
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [updateFromClientY],
  )

  const fillHeight = TRACK_H * (value / 100)
  const thumbTop = TRACK_TOP + TRACK_H * (1 - value / 100) - THUMB_SIZE / 2

  return (
    <div className="relative select-none" style={{ width: PANEL_W, height: PANEL_H }}>
      <img
        src={RAW_FIGMA_EXPORTS.volumePanel}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        className="absolute cursor-pointer"
        style={{ left: TRACK_LEFT, top: TRACK_TOP, width: TRACK_W, height: TRACK_H, touchAction: 'none' }}
      >
        <img
          src={RAW_FIGMA_EXPORTS.volumeFill}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 w-full overflow-hidden"
          style={{ height: fillHeight }}
        >
          <img
            src={RAW_FIGMA_EXPORTS.volumeRail}
            alt=""
            draggable={false}
            className="absolute bottom-0 left-0 w-full"
            style={{ height: TRACK_H }}
          />
        </div>
      </div>

      <img
        src={RAW_FIGMA_EXPORTS.volumeThumb}
        alt=""
        draggable={false}
        onPointerDown={handlePointerDown}
        className="absolute cursor-grab"
        style={{ left: THUMB_LEFT, top: thumbTop, width: THUMB_SIZE, height: THUMB_SIZE, touchAction: 'none' }}
      />
    </div>
  )
}
