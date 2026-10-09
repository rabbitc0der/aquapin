import './Header.css'

/**
 * SEVERITY_LEGEND — Static data for the three pin types.
 * Defined outside the component so it's not re-created on every render.
 */
const SEVERITY_LEGEND = [
  { id: 'caution', label: 'Ankle-deep', modifier: 'caution' },
  { id: 'warning', label: 'Knee-deep',  modifier: 'warning' },
  { id: 'danger',  label: 'Blocked',    modifier: 'danger'  },
]

/**
 * Header — Fixed top bar.
 *
 * Shows:
 *  - AquaPin brand (left)
 *  - Live status & countdown refresh button (center-right)
 *  - Severity legend chips (right) — visual key for the map pins
 *
 * Props:
 *  @param {number} countdown - seconds remaining until next auto-refresh
 *  @param {boolean} isRefreshing - whether a fetch is currently in flight
 *  @param {Function} onRefresh - callback to manually trigger an immediate refresh
 *  @param {string|null} selectedSeverity - currently active severity filter
 *  @param {Function} onToggleSeverity - callback when a severity filter chip is clicked
 *  @param {Object} pinCounts - count of active pins per severity { caution, warning, danger }
 */
function Header({
  countdown = 30,
  isRefreshing = false,
  onRefresh,
  selectedSeverity = null,
  onToggleSeverity,
  pinCounts = {},
}) {
  return (
    <>
      {/* ── Brand ─────────────────────────────────────────── */}
      <div className="header__brand">
        <span className="header__logo" aria-hidden="true">📍</span>
        <span className="header__name">
          <span>Aqua</span>Pin
        </span>
      </div>

      {/* ── Header Controls (Live Status + Filter Legend) ─── */}
      <div className="header__right">
        {/* Live Refresh Badge */}
        <button
          type="button"
          className={`refresh-badge ${isRefreshing ? 'refresh-badge--refreshing' : ''}`}
          onClick={onRefresh}
          title="Click to refresh live pins now"
          aria-label={isRefreshing ? 'Refreshing live pins' : `Next refresh in ${countdown} seconds. Click to refresh now`}
        >
          <span className="refresh-badge__pulse" aria-hidden="true" />
          <span className="refresh-badge__icon" aria-hidden="true">↻</span>
          <span className="refresh-badge__text">
            {isRefreshing ? 'Syncing…' : `${countdown}s`}
          </span>
        </button>

        {/* ── Severity Filter Chips ─────────────────────────── */}
        <nav className="header__legend" aria-label="Pin severity filter">
          {SEVERITY_LEGEND.map(({ id, label, modifier }) => {
            const isSelected = selectedSeverity === id
            const isDimmed = selectedSeverity !== null && !isSelected
            const count = pinCounts[id] || 0

            return (
              <button
                key={id}
                type="button"
                className={[
                  'legend-chip',
                  `legend-chip--${modifier}`,
                  isSelected ? `legend-chip--active-${modifier}` : '',
                  isDimmed ? 'legend-chip--dimmed' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onToggleSeverity && onToggleSeverity(id)}
                title={isSelected ? `Filtering by ${label} (Click to show all)` : `Filter by ${label} (${count} active)`}
                aria-pressed={isSelected}
              >
                <span className="legend-chip__dot" aria-hidden="true" />
                <span className="legend-chip__label">{label}</span>
                {count > 0 && <span className="legend-chip__count">({count})</span>}
              </button>
            )
          })}
        </nav>
      </div>
    </>
  )
}

export default Header


