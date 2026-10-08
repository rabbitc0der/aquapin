import { useEffect, useRef } from 'react'
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
 *  @param {Function} onLocationFound — callback providing user's coordinates [lat, lng]
 *  @param {Function} onConfirmPin — callback when user verifies flood is still active
 *  @param {Set|Array} confirmedPinIds — set of pinIds already confirmed by the user in this session
 */
function MapView({ pins = [], onLocationFound, onConfirmPin, confirmedPinIds = new Set() }) {
  const containerRef    = useRef(null)  // the DOM node Leaflet attaches to
  const mapRef          = useRef(null)  // the Leaflet map instance
  const markersLayerRef = useRef(null)  // Leaflet LayerGroup for dynamic pins

  // 1. Initialise map instance once on mount
  useEffect(() => {
    if (mapRef.current) return

    const map = L.map(containerRef.current, {
      center:             DEFAULT_CENTER,
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

    // Request user GPS
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          map.setView([latitude, longitude], DEFAULT_ZOOM)
          L.marker([latitude, longitude], { icon: createUserIcon() }).addTo(map)
          if (onLocationFound) {
            onLocationFound([latitude, longitude])
          }
        },
        () => {
          console.info('[AquaPin] Geolocation unavailable; using default center.')
          if (onLocationFound) {
            onLocationFound(DEFAULT_CENTER)
          }
        }
      )
    } else if (onLocationFound) {
      onLocationFound(DEFAULT_CENTER)
    }

    return () => {
      map.remove()
      mapRef.current = null
      markersLayerRef.current = null
    }
  }, [onLocationFound])

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

  return <div ref={containerRef} className="map-container" />
}

export default MapView

