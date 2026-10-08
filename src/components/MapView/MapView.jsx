import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './MapView.css'

// ── Constants ────────────────────────────────────────────────

/** Default center: DTU, Delhi — our hackathon venue */
const DEFAULT_CENTER = [28.7497, 77.1183]
const DEFAULT_ZOOM   = 14

/**
 * MOCK_PINS — Hardcoded sample data so the map looks populated
 * before the real AWS backend is connected (Phase 2).
 * Shape mirrors the DynamoDB schema: { pinId, lat, lng, severity }
 */
const MOCK_PINS = [
  { pinId: 'mock-1', lat: 28.7520, lng: 77.1150, severity: 'danger'  },
  { pinId: 'mock-2', lat: 28.7480, lng: 77.1220, severity: 'warning' },
  { pinId: 'mock-3', lat: 28.7510, lng: 77.1200, severity: 'caution' },
  { pinId: 'mock-4', lat: 28.7460, lng: 77.1160, severity: 'danger'  },
  { pinId: 'mock-5', lat: 28.7500, lng: 77.1250, severity: 'caution' },
]

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
 *  - Render mock severity pins with custom teardrop icons
 *  - Clean up the map instance on unmount
 *
 * Props: none (will accept `pins` prop in Phase 3 when backend is live)
 */
function MapView() {
  const containerRef = useRef(null)  // the DOM node Leaflet attaches to
  const mapRef       = useRef(null)  // the Leaflet map instance

  useEffect(() => {
    // Guard: only initialise once
    if (mapRef.current) return

    // ── 1. Initialise map ──────────────────────────────────
    const map = L.map(containerRef.current, {
      center:          DEFAULT_CENTER,
      zoom:            DEFAULT_ZOOM,
      zoomControl:     true,
      attributionControl: true,
    })
    mapRef.current = map

    // ── 2. OpenStreetMap tile layer (no API key needed) ────
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    // ── 3. Mock severity pins ──────────────────────────────
    MOCK_PINS.forEach(({ pinId, lat, lng, severity }) => {
      const severityLabel = {
        caution: 'Ankle-deep — passable with caution',
        warning: 'Knee-deep — avoid if possible',
        danger:  'Road blocked — do not enter',
      }[severity]

      L.marker([lat, lng], { icon: createPinIcon(severity) })
        .bindPopup(
          `<strong>${severityLabel}</strong><br/><small>Community report</small>`,
          { className: 'aquapin-popup' }
        )
        .addTo(map)
    })

    // ── 4. Request user GPS ────────────────────────────────
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          // Pan to user's real location
          map.setView([latitude, longitude], DEFAULT_ZOOM)
          // Drop pulsing user-location dot
          L.marker([latitude, longitude], { icon: createUserIcon() })
            .addTo(map)
        },
        () => {
          // Permission denied or unavailable — stay on DEFAULT_CENTER
          console.info('[AquaPin] Geolocation unavailable; using default center.')
        }
      )
    }

    // ── 5. Cleanup on unmount ──────────────────────────────
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, []) // empty deps — run once on mount only

  return <div ref={containerRef} className="map-container" />
}

export default MapView
