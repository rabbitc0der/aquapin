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
 *  - Severity legend chips (right) — visual key for the map pins
 *
 * Props: none (stateless display component)
 */
function Header() {
  return (
    <>
      {/* ── Brand ─────────────────────────────────────────── */}
      <div className="header__brand">
        <span className="header__logo" aria-hidden="true">📍</span>
        <span className="header__name">
          <span>Aqua</span>Pin
        </span>
      </div>

      {/* ── Severity Legend ───────────────────────────────── */}
      <nav className="header__legend" aria-label="Pin severity legend">
        {SEVERITY_LEGEND.map(({ id, label, modifier }) => (
          <div
            key={id}
            className={`legend-chip legend-chip--${modifier}`}
            role="img"
            aria-label={label}
          >
            <span className="legend-chip__dot" aria-hidden="true" />
            <span className="legend-chip__label">{label}</span>
          </div>
        ))}
      </nav>
    </>
  )
}

export default Header
