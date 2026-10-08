import { useState } from 'react'
import './App.css'
import Header      from './components/Header/Header'
import MapView     from './components/MapView/MapView'
import FAB         from './components/FAB/FAB'
import ReportModal from './components/ReportModal/ReportModal'

/**
 * App — Top-level shell component.
 *
 * State:
 *  isModalOpen — shared between FAB (opens) and ReportModal (closes).
 *
 * Handlers:
 *  handleReport — stub for now; will call the AWS API in Phase 3.
 */
function App() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  /**
   * handleReport — receives { severity } from ReportModal.
   * Phase 3 will: get GPS coords, POST to API Gateway → Lambda → DynamoDB.
   */
  function handleReport({ severity }) {
    console.log('[AquaPin] Report submitted:', severity)
    // TODO Phase 3: call api.postPin({ severity, lat, lng })
    setIsModalOpen(false)
  }

  return (
    <div className="app-shell">

      {/* ── Header ────────────────────────────────────────── */}
      <header className="app-header">
        <Header />
      </header>

      {/* ── Map ───────────────────────────────────────────── */}
      <main className="app-map">
        <MapView />
      </main>

      {/* ── FAB ───────────────────────────────────────────── */}
      <div className="app-fab">
        <FAB onClick={() => setIsModalOpen(true)} />
      </div>

      {/* ── Report Modal ──────────────────────────────────── */}
      <ReportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleReport}
      />

    </div>
  )
}

export default App
