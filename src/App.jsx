import { useState, useEffect, useCallback } from 'react'
import './App.css'
import Header      from './components/Header/Header'
import MapView, { DEFAULT_CENTER } from './components/MapView/MapView'
import FAB         from './components/FAB/FAB'
import ReportModal from './components/ReportModal/ReportModal'
import Toast       from './components/Toast/Toast'
import { getPins, postPin, confirmPin } from './services/api'

/**
 * App — Top-level shell component.
 *
 * State:
 *  - pins: dynamic list of flood pins from API
 *  - isModalOpen: controls the ReportModal bottom sheet
 *  - userCoords: user's current GPS coordinates [lat, lng]
 *  - isSubmitting: loading state while submitting report
 *  - confirmedPinIds: set of pinIds verified by this user
 *  - isOnline: browser online/offline status
 */
function App() {
  const [pins, setPins] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [userCoords, setUserCoords] = useState(DEFAULT_CENTER)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmedPinIds, setConfirmedPinIds] = useState(() => new Set())
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))

  // Live auto-refresh countdown state (30 seconds)
  const REFRESH_INTERVAL = 30
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [isRefreshing, setIsRefreshing] = useState(false)


  // Toast notification state
  const [toast, setToast] = useState({
    visible:  false,
    title:    '',
    message:  '',
    variant:  'success',
  })

  const showToast = useCallback(({ title, message = '', variant = 'success' }) => {
    setToast({ visible: true, title, message, variant })
  }, [])

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }))
  }, [])

  // Fetch active pins on mount and periodic refresh
  const refreshPins = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const fetchedPins = await getPins()
      if (fetchedPins && fetchedPins.length > 0) {
        setPins(fetchedPins)
      }
    } catch (err) {
      console.warn('[AquaPin] Error refreshing pins:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  // Countdown timer: ticks down every second and triggers refreshPins when reaching 0
  useEffect(() => {
    Promise.resolve().then(() => {
      refreshPins()
    })

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          refreshPins()
          return REFRESH_INTERVAL
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [refreshPins])


  // Online / Offline network event detection
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true)
      showToast({
        title: 'Back online',
        message: 'Synchronizing latest flood pins.',
        variant: 'success',
      })
      refreshPins()
    }
    const onOffline = () => {
      setIsOnline(false)
      showToast({
        title: 'You are offline',
        message: 'Operating in cached offline mode.',
        variant: 'warning',
      })
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [refreshPins, showToast])

  const handleManualRefresh = useCallback(() => {
    setCountdown(REFRESH_INTERVAL)
    refreshPins()
  }, [refreshPins])

  /**
   * handleConfirmPin — community verifies a flood is still active
   */
  const handleConfirmPin = useCallback(async (pinId) => {
    if (confirmedPinIds.has(pinId)) return

    // Optimistically record the user's confirmation
    setConfirmedPinIds((prev) => new Set(prev).add(pinId))
    setPins((prevPins) =>
      prevPins.map((p) =>
        p.pinId === pinId
          ? { ...p, confirmations: (Number(p.confirmations) || 0) + 1 }
          : p
      )
    )

    showToast({
      title: 'Verification recorded!',
      message: 'Thank you for helping keep Delhi updated.',
      variant: 'success',
    })

    try {
      await confirmPin(pinId)
    } catch (err) {
      console.warn('[AquaPin] confirmPin network warning:', err)
    }
  }, [confirmedPinIds, showToast])

  const handleLocationFound = useCallback((coords) => {
    setUserCoords(coords)
  }, [])

  /**
   * handleReport — submits waterlogging report to backend
   */
  async function handleReport({ severity, comment }) {
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
        comment: comment || 'Reported via AquaPin mobile web',
      })


      if (newPin) {
        setPins((prev) => [newPin, ...prev])
      }

      setIsModalOpen(false)
      showToast({
        title:   'Report submitted!',
        message: 'Warning added to the community map.',
        variant: 'success',
      })
    } catch (err) {
      console.error('[AquaPin] Failed to report pin:', err)
      showToast({
        title:   'Submission failed',
        message: 'Check your connection and try again.',
        variant: 'error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell">

      <header className="app-header">
        <Header
          countdown={countdown}
          isRefreshing={isRefreshing}
          onRefresh={handleManualRefresh}
        />
      </header>

      {/* ── Offline Banner ────────────────────────────────── */}
      {!isOnline && (
        <div className="offline-banner" role="status">
          <span className="offline-banner__icon" aria-hidden="true">⚠️</span>
          <span>You are offline. Showing cached flood reports.</span>
        </div>
      )}

      {/* ── Map ───────────────────────────────────────────── */}
      <main className="app-map">
        <MapView
          pins={pins}
          onLocationFound={handleLocationFound}
          onConfirmPin={handleConfirmPin}
          confirmedPinIds={confirmedPinIds}
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
        userCoords={userCoords}
      />


      {/* ── Toast notification ────────────────────────────── */}
      <Toast
        isVisible={toast.visible}
        title={toast.title}
        message={toast.message}
        variant={toast.variant}
        onHide={hideToast}
      />

    </div>
  )
}

export default App
