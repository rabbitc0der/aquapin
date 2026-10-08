import './FAB.css'

/**
 * FAB — Floating Action Button ("Report Flood").
 *
 * The primary call-to-action of the entire app.
 * Rendered fixed at the bottom-center of the screen (position
 * is controlled by .app-fab in App.css).
 *
 * Props:
 *  @param {Function} onClick — called when the button is tapped.
 *                              Parent (App) will use this to open
 *                              the ReportModal in the next step.
 */
function FAB({ onClick }) {
  return (
    <div className="fab-wrapper">
      <button
        id="report-flood-btn"
        className="fab"
        type="button"
        onClick={onClick}
        aria-label="Report a flood or waterlogging"
      >
        <span className="fab__icon" aria-hidden="true">🚨</span>
        Report Flood
      </button>
    </div>
  )
}

export default FAB
