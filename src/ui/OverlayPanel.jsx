import CloseOutlined from '@ant-design/icons/CloseOutlined'

export const OVERLAY_PANEL_WIDTH = 972
export const OVERLAY_PANEL_HEIGHT = 698

export function OverlayPanel({
  backgroundSrc,
  backgroundAlt = '',
  title,
  subtitle,
  onClose,
  children,
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(15,23,42,0.22)] p-4"
      onClick={onClose}
    >
      <div
        className="relative"
        style={{
          width: `min(${OVERLAY_PANEL_WIDTH}px, calc(100vw - 32px), calc((100vh - 32px) * ${OVERLAY_PANEL_WIDTH} / ${OVERLAY_PANEL_HEIGHT}))`,
          aspectRatio: `${OVERLAY_PANEL_WIDTH} / ${OVERLAY_PANEL_HEIGHT}`,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={backgroundSrc}
          alt={backgroundAlt}
          aria-hidden={backgroundAlt ? undefined : true}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        <button
          type="button"
          aria-label="关闭"
          className="absolute right-[18px] top-[18px] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(241,245,249,0.94)] text-slate-700 transition hover:bg-[rgba(226,232,240,0.98)]"
          onClick={onClose}
        >
          <CloseOutlined />
        </button>

        <div className="absolute left-[5.4%] top-[5.2%] max-w-[60%] text-slate-700">
          <div className="text-[28px] font-semibold leading-tight text-slate-800">{title}</div>
          {subtitle ? <div className="mt-2 text-[14px] leading-6 text-slate-500">{subtitle}</div> : null}
        </div>

        {children}
      </div>
    </div>
  )
}
