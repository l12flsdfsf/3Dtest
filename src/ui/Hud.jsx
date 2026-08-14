export function Crosshair({ focused }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="crosshair">
        <div className="crosshair__ring" />
        <div className="crosshair__dot" />
      </div>
      {focused ? (
        <div className="absolute left-1/2 top-[calc(50%+28px)] -translate-x-1/2 rounded-full border border-white/80 bg-slate-950/76 px-4 py-2 text-xs font-medium text-white shadow-[0_16px_40px_rgba(15,23,42,0.22)]">
          {'按 E 打开 '}
          {focused.title}
        </div>
      ) : null}
    </div>
  )
}
