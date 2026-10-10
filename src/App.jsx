import { useState, useEffect, useCallback, useMemo } from 'react'
import './App.css'
import Header      from './components/Header/Header'
import MapView, { DEFAULT_CENTER } from './components/MapView/MapView'
import FAB         from './components/FAB/FAB'
import ReportModal from './components/ReportModal/ReportModal'
import Toast       from './components/Toast/Toast'
import { getPins, postPin, votePin } from './services/api'

/**
 * App — Top-level shell component.
 *
 * State:
 *  - pins: dynamic list of flood pins from API
 *  - selectedSeverity: active filter ('caution' | 'warning' | 'danger' | null)
 *  - isModalOpen: controls the ReportModal bottom sheet
 *  - userCoords: user's current GPS coordinates [lat, lng]
 *  - isSubmitting: loading state while submitting report
 *  - confirmedPinIds: set of pinIds verified by this user
 *  - userVotes: map of pinId -> 'still_flooded' | 'cleared'
 *  - isOnline: browser online/offline status
 */
function App() {
  const [pins, setPins] = useState([])
  const [selectedSeverity, setSelectedSeverity] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [userCoords, setUserCoords] = useState(DEFAULT_CENTER)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmedPinIds, setConfirmedPinIds] = useState(() => new Set())
  const [userVotes, setUserVotes] = useState(() => new Map())
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))

  // Live auto-refresh countdown state (30 seconds)
  const REFRESH_INTERVAL = 30
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleToggleSeverity = useCallback((sev) => {
    setSelectedSeverity((prev) => (prev === sev ? null : sev))
  }, [])

  // Calculate active flood pin counts per severity (excludes resolved)
  const pinCounts = useMemo(() => {
    return pins.reduce((acc, pin) => {
      if (pin.status !== 'resolved') {
        acc[pin.severity] = (acc[pin.severity] || 0) + 1
      }
      return acc
    }, {})
  }, [pins])

  // Filter pins based on active severity filter
  const visiblePins = useMemo(() => {
    if (!selectedSeverity) return pins
    return pins.filter((p) => p.severity === selectedSeverity)
  }, [pins, selectedSeverity])



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
   * handleVotePin — community consensus ("Still Flooded?" vs "Water Cleared")
   */
  const handleVotePin = useCallback(async (pinId, voteType = 'still_flooded') => {
    if (userVotes.has(pinId)) return

    // Optimistically record the user's vote
    setUserVotes((prev) => new Map(prev).set(pinId, voteType))
    setConfirmedPinIds((prev) => new Set(prev).add(pinId))

    if (voteType === 'still_flooded') {
      setPins((prevPins) =>
        prevPins.map((p) => {
          if (p.pinId !== pinId) return p
          const currentFlooded = (Number(p.stillFloodedCount) || Number(p.confirmations) || 0) + 1
          return {
            ...p,
            stillFloodedCount: currentFlooded,
            confirmations: currentFlooded,
          }
        })
      )
      showToast({
        title: 'Active Flood Confirmed! 🌊',
        message: 'Thank you! Alert extended to keep commuters safe.',
        variant: 'info',
      })
    } else if (voteType === 'cleared') {
      let willBeResolved = false
      setPins((prevPins) =>
        prevPins.map((p) => {
          if (p.pinId !== pinId) return p
          const newCleared = (Number(p.clearedCount) || 0) + 1
          willBeResolved = newCleared >= 2
          return {
            ...p,
            clearedCount: newCleared,
            status: willBeResolved ? 'resolved' : p.status,
            resolvedAt: willBeResolved ? new Date().toISOString() : p.resolvedAt,
          }
        })
      )
      showToast({
        title: willBeResolved ? 'Water Cleared! Consensus Reached ✅' : 'Clearance Vote Recorded 👍',
        message: willBeResolved
          ? 'Pin marked as resolved by community consensus.'
          : '1 more community vote needed to resolve this pin.',
        variant: willBeResolved ? 'success' : 'info',
      })
    }

    try {
      const result = await votePin(pinId, voteType)
      if (result && result.pin) {
        setPins((prevPins) =>
          prevPins.map((p) => (p.pinId === pinId ? { ...p, ...result.pin } : p))
        )
      }
    } catch (err) {
      console.warn('[AquaPin] votePin network warning:', err)
    }
  }, [userVotes, showToast])

  const handleConfirmPin = useCallback((pinId) => {
    return handleVotePin(pinId, 'still_flooded')
  }, [handleVotePin])

  const handleLocationFound = useCallback((coords) => {
    setUserCoords(coords)
  }, [])

  const handleLocationError = useCallback((message) => {
    showToast({
      title: 'Location Notice',
      message: message || 'Using default location (DTU, Delhi).',
      variant: 'warning',
    })
  }, [showToast])

  /**
   * handleReport — submits waterlogging report to backend

   */
  async function handleReport({ severity, comment, photo, aiResult }) {
    try {
      setIsSubmitting(true)

      // Add a tiny random offset (~10-20 meters) if near the exact same spot to avoid stacking
      const jitterLat = (Math.random() - 0.5) * 0.0005
      const jitterLng = (Math.random() - 0.5) * 0.0005

      const lat = Number((userCoords[0] + jitterLat).toFixed(5))
      const lng = Number((userCoords[1] + jitterLng).toFixed(5))

      const newPin = await postPin({
        lat,
        lng,
        severity,
        comment: comment || 'Reported via AquaPin mobile web',
        photo: photo || null,
        pixelMetrics: aiResult ? {
          isFloodWater: aiResult.aiVerified,
          isPortraitOrSelfie: !aiResult.aiVerified,
          waterRatio: aiResult.aiVerified ? 0.35 : 0.05,
        } : null,
      })

      if (newPin) {
        setPins((prev) => [newPin, ...prev])
      }

      setIsModalOpen(false)
      showToast({
        title:   newPin?.aiVerified ? '🤖 AI-Verified Report Submitted!' : 'Report submitted!',
        message: newPin?.aiVerified
          ? `Validated with ${newPin.aiConfidence}% confidence.`
          : 'Warning added to the community map.',
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
          selectedSeverity={selectedSeverity}
          onToggleSeverity={handleToggleSeverity}
          pinCounts={pinCounts}
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
          pins={visiblePins}
          userCoords={userCoords}
          onLocationFound={handleLocationFound}
          onLocationError={handleLocationError}
          onConfirmPin={handleConfirmPin}
          onVotePin={handleVotePin}
          userVotes={userVotes}
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
