function NavButton({ label, active, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={['nav-button', active ? 'nav-button--active' : '', danger ? 'nav-button--danger' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </button>
  )
}

export function TopBar({
  autoActive,
  helpActive,
  mapActive,
  musicActive,
  onAutoRoam,
  onHelp,
  onMap,
  onMusic,
  onExit,
}) {
  return (
    <div className="pointer-events-none absolute right-8 top-8 z-30">
      <div className="pointer-events-auto flex items-center gap-4 rounded-[26px] border border-white/65 bg-white/76 px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur">
        <NavButton label={'\u81ea\u4e3b\u6f2b\u6e38'} active={autoActive} onClick={onAutoRoam} />
        <NavButton label={'\u5e2e\u52a9'} active={helpActive} onClick={onHelp} />
        <NavButton label={'\u5c55\u5385\u5730\u56fe'} active={mapActive} onClick={onMap} />
        <NavButton label={'\u5168\u5c40\u97f3\u4e50'} active={musicActive} onClick={onMusic} />
        <NavButton label={'\u9000\u51fa'} onClick={onExit} danger />
      </div>
    </div>
  )
}
