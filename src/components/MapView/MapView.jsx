import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './MapView.css'


import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../constants'

// Re-export constants for backwards compatibility
export { DEFAULT_CENTER, DEFAULT_ZOOM }

// ── Helper: create a custom teardrop marker icon ─────────────

/**
 * createPinIcon — Returns a Leaflet DivIcon for a given severity.
 * Uses the .aquapin-marker CSS class defined in MapView.css.
 *
 * @param {'caution'|'warning'|'danger'} severity
 * @returns {L.DivIcon}
 */
function createPinIcon(severity) {
  return L.divIcon({
    className: '',   // prevent Leaflet adding its own white box
    html: `<div class="aquapin-marker aquapin-marker--${severity}"></div>`,
    iconSize:   [36, 36],
    iconAnchor: [18, 36],  // tip of the teardrop
    popupAnchor:[0, -38],
  })
}

/**
 * createUserIcon — Pulsing blue dot for the user's GPS position.
 * @returns {L.DivIcon}
 */
function createUserIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div class="user-location-marker">
        <div class="user-location-marker__ring"></div>
        <div class="user-location-marker__dot"></div>
      </div>`,
    iconSize:   [16, 16],
    iconAnchor: [8, 8],
  })
}

// ── Component ────────────────────────────────────────────────

/**
 * MapView — Full-screen Leaflet map.
 *
 * Responsibilities:
 *  - Initialise the Leaflet map once on mount (useRef prevents re-init)
 *  - Request user GPS; pan to it if granted, fall back to DEFAULT_CENTER
 *  - Render dynamic severity pins with custom teardrop icons via LayerGroup
 *  - Provide interactive "Still Flooded?" upvote/confirmation on pins
 *  - Clean up the map instance on unmount
 *
 * Props:
 *  @param {Array} pins — list of pin objects from backend
 *  @param {Array} userCoords — current user coordinates [lat, lng]
 *  @param {Function} onLocationFound — callback providing user's coordinates [lat, lng]
 *  @param {Function} onLocationError — callback when user GPS permission is denied or fails
 *  @param {Function} onConfirmPin — callback when user verifies flood is still active
 *  @param {Set|Array} confirmedPinIds — set of pinIds already confirmed by the user in this session
 */
function MapView({
  pins = [],
  userCoords = null,
  onLocationFound,
  onLocationError,
  onConfirmPin,
  confirmedPinIds = new Set(),
}) {
  const containerRef       = useRef(null)  // the DOM node Leaflet attaches to
  const mapRef             = useRef(null)  // the Leaflet map instance
  const markersLayerRef    = useRef(null)  // Leaflet LayerGroup for dynamic pins
  const userMarkerRef      = useRef(null)  // Leaflet marker for user's GPS pulse dot
  const initialCenterRef   = useRef(userCoords || DEFAULT_CENTER)
  const onLocationFoundRef = useRef(onLocationFound)
  const onLocationErrorRef = useRef(onLocationError)
  const [isLocating, setIsLocating] = useState(false)

  // Keep callback refs fresh without triggering effect re-runs
  useEffect(() => {
    onLocationFoundRef.current = onLocationFound
    onLocationErrorRef.current = onLocationError
  }, [onLocationFound, onLocationError])

  // 1. Initialise map instance strictly ONCE on mount
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const map = L.map(containerRef.current, {
      center:             initialCenterRef.current,
      zoom:               DEFAULT_ZOOM,
      zoomControl:        true,
      attributionControl: true,
    })

    mapRef.current = map

    // OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    // Markers layer group
    const markersLayer = L.layerGroup().addTo(map)
    markersLayerRef.current = markersLayer

    // Initial GPS detection on load
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          const coords = [latitude, longitude]
          map.setView(coords, DEFAULT_ZOOM)
          if (!userMarkerRef.current) {
            userMarkerRef.current = L.marker(coords, { icon: createUserIcon() }).addTo(map)
          } else {
            userMarkerRef.current.setLatLng(coords)
          }
          onLocationFoundRef.current?.(coords)
        },
        () => {
          console.info('[AquaPin] Geolocation unavailable; using default center.')
          onLocationFoundRef.current?.(DEFAULT_CENTER)
        },
        { enableHighAccuracy: false, timeout: 8000 }
      )
    } else {
      onLocationFoundRef.current?.(DEFAULT_CENTER)
    }

    return () => {
      map.remove()
      mapRef.current = null
      markersLayerRef.current = null
      userMarkerRef.current = null
    }
  }, []) // Empty dependency array: Map initializes once and NEVER flickers or tears down

  // 2. Synchronize user GPS blue dot marker whenever userCoords changes (without re-creating the map!)
  useEffect(() => {
    if (!mapRef.current || !userCoords) return
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(userCoords, { icon: createUserIcon() }).addTo(mapRef.current)
    } else {
      userMarkerRef.current.setLatLng(userCoords)
    }
  }, [userCoords])



  // 2. Synchronize pins whenever props change
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return

    markersLayerRef.current.clearLayers()

    pins.forEach(({ pinId, lat, lng, severity, comment, createdAt, confirmations = 0 }) => {
      const isConfirmed = confirmedPinIds instanceof Set
        ? confirmedPinIds.has(pinId)
        : Array.isArray(confirmedPinIds) && confirmedPinIds.includes(pinId)

      const totalConfirmations = (Number(confirmations) || 0) + (isConfirmed ? 1 : 0)

      const severityLabel = {
        caution: 'Ankle-deep — passable with caution',
        warning: 'Knee-deep — avoid if possible',
        danger:  'Road blocked — do not enter',
      }[severity] || 'Waterlogging report'

      const timeText = createdAt
        ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Just now'

      const commentHtml = comment
        ? `<div class="pin-popup__comment">"${comment}"</div>`
        : ''

      const popupContent = `
        <div class="pin-popup">
          <div class="pin-popup__header">
            <span class="pin-popup__badge pin-popup__badge--${severity}">${severity}</span>
            <span class="pin-popup__time">🕒 ${timeText}</span>
          </div>
          <div class="pin-popup__desc">${severityLabel}</div>
          ${commentHtml}
          <div class="pin-popup__footer">
            <button
              type="button"
              class="pin-popup__confirm-btn ${isConfirmed ? 'is-confirmed' : ''}"
              data-action="confirm-pin"
              data-pin-id="${pinId}"
              ${isConfirmed ? 'disabled' : ''}
              title="${isConfirmed ? 'You have verified this flood warning' : 'Confirm this flood is still active'}"
            >
              <span>${isConfirmed ? '✅ Confirmed by you' : '🌊 Still Flooded?'}</span>
              ${totalConfirmations > 0 ? `<span style="opacity: 0.85;">(${totalConfirmations})</span>` : ''}
            </button>
          </div>
        </div>
      `

      L.marker([lat, lng], { icon: createPinIcon(severity) })
        .bindPopup(popupContent, { className: 'aquapin-popup' })
        .addTo(markersLayerRef.current)
    })
  }, [pins, confirmedPinIds])

  // 3. Listen for clicks on the "Still Flooded?" confirmation button in popups via event delegation
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleContainerClick = (e) => {
      const btn = e.target.closest('[data-action="confirm-pin"]')
      if (!btn) return

      const pinId = btn.getAttribute('data-pin-id')
      if (pinId && onConfirmPin && !btn.classList.contains('is-confirmed')) {
        onConfirmPin(pinId)
      }
    }

    container.addEventListener('click', handleContainerClick)
    return () => container.removeEventListener('click', handleContainerClick)
  }, [onConfirmPin])

  // 4. Smooth recenter on user GPS ("Locate Me")
  const handleLocateUser = () => {
    if (!mapRef.current || isLocating) return
    setIsLocating(true)

    const fallbackCoords = userCoords || DEFAULT_CENTER

    // If we already have user coordinates, smoothly fly there immediately with zero latency
    if (userCoords) {
      mapRef.current.flyTo(userCoords, 15, { animate: true, duration: 1.0 })
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          const coords = [latitude, longitude]
          mapRef.current?.flyTo(coords, 15, { animate: true, duration: 1.0 })
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng(coords)
          } else if (mapRef.current) {
            userMarkerRef.current = L.marker(coords, { icon: createUserIcon() }).addTo(mapRef.current)
          }
          onLocationFoundRef.current?.(coords)
          setTimeout(() => setIsLocating(false), 1000)
        },
        (error) => {
          if (!userCoords) {
            mapRef.current?.flyTo(fallbackCoords, 15, { animate: true, duration: 1.0 })
          }
          if (error.code === 1) { // PERMISSION_DENIED
            onLocationErrorRef.current?.('Location permission is blocked. Please enable location access in your browser settings.')
          } else if (error.code === 3) { // TIMEOUT
            onLocationErrorRef.current?.('GPS timed out. Centered on map default (DTU, Delhi).')
          }
          setTimeout(() => setIsLocating(false), 1000)
        },
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 10000 }
      )
    } else {
      mapRef.current.flyTo(fallbackCoords, 15, { animate: true, duration: 1.0 })
      onLocationErrorRef.current?.('Geolocation is not supported by your browser.')
      setTimeout(() => setIsLocating(false), 1000)
    }
  }


  return (
    <div className="map-wrapper">
      <div ref={containerRef} className="map-container" />

      {/* ── Locate Me Floating Button ─────────────────────── */}
      <button
        type="button"
        className={`locate-me-btn ${isLocating ? 'locate-me-btn--locating' : ''}`}
        onClick={handleLocateUser}
        title="Recenter map on my location"
        aria-label="Recenter map on my location"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="locate-me-icon"
          aria-hidden="true"
        >
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
    </div>
  )
}

export default MapView


