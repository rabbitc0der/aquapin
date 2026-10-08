import './App.css'

/**
 * App — Top-level shell component.
 *
 * Responsibilities:
 *  - Defines the three layout regions: Header, Map, FAB
 *  - Owns no business logic (state lives in child components & hooks)
 *  - Each region is a placeholder — real components drop in one by one
 */
function App() {
  return (
    <div className="app-shell">

      {/* ── Header region ─────────────────────────────────── */}
      {/* Will be replaced by <Header /> component in next step */}
      <header className="app-header">
        {/* placeholder */}
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
