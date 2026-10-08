import { useState } from 'react'
import './ReportModal.css'

// ── Static Data ──────────────────────────────────────────────

/**
 * SEVERITY_OPTIONS — The three pin types a user can report.
 * Defined outside the component to avoid re-creation on re-render.
 */
const SEVERITY_OPTIONS = [
  {
    id:       'caution',
    label:    'Ankle-deep',
    desc:     'Passable with caution — proceed slowly',
    modifier: 'caution',
  },
  {
    id:       'warning',
    label:    'Knee-deep',
    desc:     'Avoid if possible — risk of stalling',
    modifier: 'warning',
  },
  {
    id:       'danger',
    label:    'Road Blocked',
    desc:     'Do NOT enter — vehicles will be swept',
    modifier: 'danger',
  },
]

// ── Component ────────────────────────────────────────────────

/**
 * ReportModal — Bottom sheet for dropping a flood pin.
 *
 * Props:
 *  @param {boolean}  isOpen   — controls visibility (owned by App)
 *  @param {Function} onClose  — called when the backdrop or cancel is tapped
 *  @param {Function} onSubmit — called with { severity } when user confirms
 *                               (will trigger GPS + API call in Phase 3)
 */
function ReportModal({ isOpen, onClose, onSubmit }) {
  const [selected, setSelected] = useState(null)

  // Don't render anything if closed — keeps DOM clean
  if (!isOpen) return null

  function handleSubmit() {
    if (!selected) return
    onSubmit({ severity: selected })
    setSelected(null) // reset for next time
  }

  function handleBackdropClick(e) {
    // Only close if the click was on the backdrop itself, not the sheet
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Report a flood"
    >
      <div className="modal-sheet">

        {/* ── Drag handle ─────────────────────────────────── */}
        <div className="modal-sheet__handle" aria-hidden="true" />

        {/* ── Title ───────────────────────────────────────── */}
        <h2 className="modal-sheet__title">Report Waterlogging</h2>
        <p className="modal-sheet__subtitle">
          Select the severity at your location
        </p>

        {/* ── Severity options ─────────────────────────────── */}
        <div className="severity-options" role="radiogroup" aria-label="Severity level">
          {SEVERITY_OPTIONS.map(({ id, label, desc, modifier }) => {
            const isSelected = selected === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={[
                  'severity-card',
                  isSelected ? `severity-card--selected-${modifier}` : '',
                ].join(' ')}
                onClick={() => setSelected(id)}
              >
                <span
                  className={`severity-card__dot severity-card__dot--${modifier}`}
                  aria-hidden="true"
                />
                <span className="severity-card__info">
                  <span className="severity-card__label">{label}</span>
                  <span className="severity-card__desc">{desc}</span>
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Submit ──────────────────────────────────────── */}
        <button
          id="submit-report-btn"
          type="button"
          className={[
            'modal-submit',
            selected ? 'modal-submit--active' : '',
          ].join(' ')}
          onClick={handleSubmit}
          disabled={!selected}
          aria-disabled={!selected}
        >
          {selected ? `📍 Drop Pin — ${SEVERITY_OPTIONS.find(o => o.id === selected)?.label}` : 'Select a severity above'}
        </button>

      </div>
    </div>
  )
}

export default ReportModal
