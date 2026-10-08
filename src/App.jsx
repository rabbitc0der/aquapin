import { useState } from 'react'
import './App.css'
import Header  from './components/Header/Header'
import MapView from './components/MapView/MapView'
import FAB     from './components/FAB/FAB'

/**
 * App — Top-level shell component.
 *
 * State:
 *  isModalOpen — controls visibility of ReportModal (built in next step).
 *                Lifted here so FAB (opens) and Modal (closes) can share it.
 */
function App() {
  const [isModalOpen, setIsModalOpen] = useState(false)

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

      {/* ── ReportModal ───────────────────────────────────── */}
      {/* Placeholder: <ReportModal> mounts here in next step */}

    </div>
  )
}

export default App
