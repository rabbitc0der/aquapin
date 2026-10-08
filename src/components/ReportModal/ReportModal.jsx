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
 *  @param {boolean}  isOpen       — controls visibility (owned by App)
 *  @param {Function} onClose      — called when the backdrop or cancel is tapped
 *  @param {Function} onSubmit     — called with { severity, comment } when user confirms
 *  @param {boolean}  isSubmitting — whether the submission API request is pending
 *  @param {Array}    userCoords   — current [lat, lng] of user
 */
function ReportModal({ isOpen, onClose, onSubmit, isSubmitting = false, userCoords = null }) {
  const [selected, setSelected] = useState(null)
  const [comment, setComment] = useState('')

  // Don't render anything if closed — keeps DOM clean
  if (!isOpen) return null

  function handleSubmit() {
    if (!selected || isSubmitting) return
    onSubmit({
      severity: selected,
      comment: comment.trim(),
    })
    setSelected(null) // reset for next time
    setComment('')
  }

  function handleBackdropClick(e) {
    // Only close if the click was on the backdrop itself, not the sheet
    if (e.target === e.currentTarget) {
      setSelected(null)
      setComment('')
      onClose()
    }
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
          Select the severity at your current location
        </p>

        {/* ── Location GPS Indicator ───────────────────────── */}
        <div className="modal-sheet__location" role="status">
          <span className="location-dot" aria-hidden="true" />
          <span>
            {Array.isArray(userCoords) && userCoords.length === 2
              ? `GPS: ${userCoords[0].toFixed(4)}° N, ${userCoords[1].toFixed(4)}° E (active)`
              : 'Acquiring GPS location...'}
          </span>
        </div>

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

        {/* ── Optional Comment Input ──────────────────────── */}
        <div className="modal-sheet__comment-group">
          <input
            type="text"
            className="modal-sheet__comment-input"
            placeholder="Add optional note (e.g. Near Metro Gate 2, car stalled)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={100}
            aria-label="Optional details or landmark"
          />
        </div>

        {/* ── Submit ──────────────────────────────────────── */}
        <button
          id="submit-report-btn"
          type="button"
          className={[
            'modal-submit',
            selected && !isSubmitting ? 'modal-submit--active' : '',
          ].join(' ')}
          onClick={handleSubmit}
          disabled={!selected || isSubmitting}
          aria-disabled={!selected || isSubmitting}
        >
          {isSubmitting
            ? '⏳ Submitting report...'
            : selected
            ? `📍 Drop Pin — ${SEVERITY_OPTIONS.find(o => o.id === selected)?.label}`
            : 'Select a severity above'}
        </button>


      </div>
    </div>
  )
}

export default ReportModal
