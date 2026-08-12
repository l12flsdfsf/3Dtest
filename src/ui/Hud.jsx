function TipPill({ children }) {
  return (
    <div className="rounded-full border border-white/70 bg-white/84 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.10)] backdrop-blur">
      {children}
    </div>
  )
}

export function Crosshair({ focused }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="crosshair">
        <div className="crosshair__ring" />
        <div className="crosshair__dot" />
      </div>
      {focused ? (
        <div className="absolute left-1/2 top-[calc(50%+28px)] -translate-x-1/2 rounded-full border border-white/80 bg-slate-950/76 px-4 py-2 text-xs font-medium text-white shadow-[0_16px_40px_rgba(15,23,42,0.22)]">
          {'\u6309 E \u6253\u5f00 '}
          {focused.title}
        </div>
      ) : null}
    </div>
  )
}

export function HelpBar({ mode, locked }) {
  let tips = []

  if (mode === 'roam' && locked) {
    tips = [
      'WASD \u79fb\u52a8',
      '\u9f20\u6807\u53f3\u952e\u62d6\u52a8\u8f6c\u5411',
      'Shift \u52a0\u901f',
      'E \u6253\u5f00\u70ed\u70b9',
      'Esc \u9000\u51fa\u6f2b\u6e38',
    ]
  } else if (mode === 'auto') {
    tips = [
      '\u81ea\u52a8\u5de1\u822a\u8fdb\u884c\u4e2d',
      '\u70b9\u51fb\u201c\u81ea\u4e3b\u6f2b\u6e38\u201d\u518d\u6b21\u5207\u56de\u624b\u52a8\u6f2b\u6e38',
      '\u70b9\u51fb\u70ed\u70b9\u53ef\u6682\u505c\u5e76\u67e5\u770b\u5185\u5bb9',
    ]
  } else if (mode === 'inspect') {
    tips = [
      '\u5f53\u524d\u672a\u5904\u4e8e\u624b\u52a8\u6f2b\u6e38',
      '\u70b9\u51fb\u201c\u81ea\u4e3b\u6f2b\u6e38\u201d\u5f00\u59cb\u81ea\u52a8\u5de1\u822a',
      '\u518d\u6b21\u70b9\u51fb\u53ef\u56de\u5230\u624b\u52a8',
    ]
  } else {
    tips = ['\u70b9\u51fb\u53f3\u4e0a\u89d2\u201c\u5e2e\u52a9\u201d\u67e5\u770b WASD \u64cd\u4f5c\u8bf4\u660e']
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 px-6">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-2">
        {tips.map((tip) => (
          <TipPill key={tip}>{tip}</TipPill>
        ))}
      </div>
    </div>
  )
}
