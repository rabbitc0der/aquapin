import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './MapView.css'

// ── Constants ────────────────────────────────────────────────

/** Default center: DTU, Delhi — our hackathon venue */
export const DEFAULT_CENTER = [28.7497, 77.1183]
export const DEFAULT_ZOOM   = 14

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
 *  - Clean up the map instance on unmount
 *
 * Props:
 *  @param {Array} pins — list of pin objects from backend
 *  @param {Function} onLocationFound — callback providing user's coordinates [lat, lng]
 */
function MapView({ pins = [], onLocationFound }) {
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

    pins.forEach(({ pinId, lat, lng, severity, comment, createdAt }) => {
      const severityLabel = {
        caution: 'Ankle-deep — passable with caution',
        warning: 'Knee-deep — avoid if possible',
        danger:  'Road blocked — do not enter',
      }[severity] || 'Waterlogging report'

      const timeText = createdAt
        ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Just now'

      const commentHtml = comment
        ? `<div style="margin-top: 4px; font-style: italic; color: #475569;">"${comment}"</div>`
        : ''

      const popupContent = `
        <div style="font-family: inherit; font-size: 13px;">
          <strong style="font-size: 14px;">${severityLabel}</strong>
          ${commentHtml}
          <div style="margin-top: 6px; font-size: 11px; color: #94a3b8;">
            🕒 Reported at ${timeText} • Community alert
          </div>
        </div>
      `

      L.marker([lat, lng], { icon: createPinIcon(severity) })
        .bindPopup(popupContent, { className: 'aquapin-popup' })
        .addTo(markersLayerRef.current)
    })
  }, [pins])

  return <div ref={containerRef} className="map-container" />
}

export default MapView
