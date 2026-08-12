import { useEffect, useState } from 'react'

export function AssetPanel({ hotspots, onSelect }) {
  return (
    <aside className="pointer-events-none absolute inset-x-0 bottom-16 z-20 px-4">
      <div className="mx-auto flex max-w-[1400px] justify-end">
        <div className="pointer-events-auto w-full max-w-[760px] rounded-[28px] bg-white/90 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.16)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between px-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Imported Assets</div>
              <div className="text-sm font-medium text-slate-800">导出素材预览</div>
            </div>
            <div className="text-xs text-slate-500">点击缩略图可直接打开对应内容</div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {hotspots.map((hotspot) => (
              <button
                key={hotspot.id}
                type="button"
                onClick={() => onSelect(hotspot)}
                className="overflow-hidden rounded-[22px] border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(15,23,42,0.12)]"
              >
                <PreviewImage hotspot={hotspot} />
                <div className="space-y-1 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {hotspot.code}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: `${hotspot.color}1f`, color: hotspot.color }}
                    >
                      {hotspot.tag}
                    </span>
                  </div>
                  <div className="truncate text-sm font-medium text-slate-900">{hotspot.title}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

function PreviewImage({ hotspot }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [hotspot.assetSrc])

  if (!hotspot.assetSrc || failed) {
    return (
      <div
        className="flex aspect-[16/10] items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${hotspot.color}1a 0%, #f8fafc 100%)` }}
      >
        <span className="text-xs text-slate-400">未接入素材</span>
      </div>
    )
  }

  return (
    <img
      src={hotspot.assetSrc}
      alt={hotspot.assetAlt}
      className="aspect-[16/10] w-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}
