import './App.css'
import Header from './components/Header/Header'

/**
 * App — Top-level shell component.
 *
 * Responsibilities:
 *  - Defines the three layout regions: Header, Map, FAB
 *  - Owns no business logic (state lives in child components & hooks)
 *  - Real components slot in one by one as they are built
 */
function App() {
  return (
    <div className="app-shell">

      {/* ── Header ────────────────────────────────────────── */}
      <header className="app-header">
        <Header />
      </header>

      {/* ── Map region ────────────────────────────────────── */}
      {/* Will be replaced by <MapView /> component */}
      <main className="app-map">
        <p className="app-map__placeholder">Map loads here</p>
      </main>

      {/* ── Floating Action Button region ─────────────────── */}
      {/* Will be replaced by <FAB /> component */}
      <div className="app-fab">
        {/* placeholder */}
      </div>

    </div>
  )
}

export default App
