import { useState, useEffect, useCallback } from 'react'
import './App.css'
import Header      from './components/Header/Header'
import MapView, { DEFAULT_CENTER } from './components/MapView/MapView'
import FAB         from './components/FAB/FAB'
import ReportModal from './components/ReportModal/ReportModal'
import { getPins, postPin } from './services/api'

/**
 * App — Top-level shell component.
 *
 * State:
 *  - pins: dynamic list of flood pins from API
 *  - isModalOpen: controls the ReportModal bottom sheet
 *  - userCoords: user's current GPS coordinates [lat, lng]
 *  - isSubmitting: loading state while submitting report
 */
function App() {
  const [pins, setPins] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [userCoords, setUserCoords] = useState(DEFAULT_CENTER)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch active pins on mount and periodic refresh (every 30 seconds)
  const refreshPins = useCallback(async () => {
    try {
      const fetchedPins = await getPins()
      if (fetchedPins && fetchedPins.length > 0) {
        setPins(fetchedPins)
      }
    } catch (err) {
      console.warn('[AquaPin] Error refreshing pins:', err)
    }
  }, [])

  useEffect(() => {
    refreshPins()
    const interval = setInterval(refreshPins, 30000)
    return () => clearInterval(interval)
  }, [refreshPins])

  const handleLocationFound = useCallback((coords) => {
    setUserCoords(coords)
  }, [])

  /**
   * handleReport — submits waterlogging report to backend
   */
  async function handleReport({ severity }) {
    try {
      setIsSubmitting(true)

      // Add a tiny random offset (~10-20 meters) if near the exact same spot to avoid stacking
      const jitterLat = (Math.random() - 0.5) * 0.0005
      const jitterLng = (Math.random() - 0.5) * 0.0005

      const lat = userCoords[0] + jitterLat
      const lng = userCoords[1] + jitterLng

      const newPin = await postPin({
        lat,
        lng,
        severity,
        comment: 'Reported via AquaPin mobile web',
      })

      if (newPin) {
        setPins((prev) => [newPin, ...prev])
      }

      setIsModalOpen(false)
    } catch (err) {
      console.error('[AquaPin] Failed to report pin:', err)
      alert('Could not submit report. Please check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell">

      {/* ── Header ────────────────────────────────────────── */}
      <header className="app-header">
        <Header />
      </header>

      {/* ── Map ───────────────────────────────────────────── */}
      <main className="app-map">
        <MapView
          pins={pins}
          onLocationFound={handleLocationFound}
        />
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
        isSubmitting={isSubmitting}
      />

    </div>
  )
}

export default App
