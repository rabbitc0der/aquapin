import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './MapView.css'


import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../constants'

// Re-export constants for backwards compatibility
export { DEFAULT_CENTER, DEFAULT_ZOOM }

// ── Security Helpers: XSS Sanitization & Media Validation ───

/**
 * Encodes special HTML characters to prevent Stored XSS inside Leaflet popups
 * @param {string|any} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Validates whether a media URL is safe to render in an <img> tag
 * Blocks dangerous schemes (e.g. javascript:, data:text/html)
 * @param {string} url
 * @returns {boolean}
 */
function isSafeMediaUrl(url) {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (trimmed.startsWith('https://')) return true
  if (trimmed.startsWith('http://localhost') || trimmed.startsWith('http://127.0.0.1')) return true
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) return true
  return false
}

// ── Helper: create a custom teardrop marker icon ─────────────

/**
 * createPinIcon — Returns a Leaflet DivIcon for a given severity.
 * Uses the .aquapin-marker CSS class defined in MapView.css.
 * Adds a camera badge for pins with AI-verified photo evidence.
 *
 * @param {'caution'|'warning'|'danger'} severity
 * @param {boolean} hasPhoto
 * @param {boolean} aiVerified
 * @returns {L.DivIcon}
 */
function createPinIcon(severity, hasPhoto = false, aiVerified = false, isResolved = false) {
  const isAi = Boolean(aiVerified || hasPhoto)
  const badgeContent = isResolved
    ? '<span class="aquapin-marker__badge aquapin-marker__badge--resolved" title="Water Cleared (Resolved)">✓</span>'
    : (isAi ? '<span class="aquapin-marker__badge aquapin-marker__badge--ai" title="AI-Verified Photo">📷</span>' : '')

  return L.divIcon({
    className: '',   // prevent Leaflet adding its own white box
    html: `
      <div class="aquapin-marker aquapin-marker--${severity} ${isAi ? 'aquapin-marker--ai' : ''} ${isResolved ? 'aquapin-marker--resolved' : ''}">
        ${badgeContent}
      </div>`,
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
  onVotePin,
  userVotes,
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

    pins.forEach(({
      pinId,
      lat,
      lng,
      severity,
      comment,
      createdAt,
      expiresAt,
      status = 'active',
      stillFloodedCount = 0,
      clearedCount = 0,
      confirmations = 0,
      photoUrl,
      aiVerified,
      aiConfidence,
      aiTags,
    }) => {
      const userVote = (userVotes instanceof Map ? userVotes.get(pinId) : null) ||
        (confirmedPinIds instanceof Set && confirmedPinIds.has(pinId) ? 'still_flooded' : null) ||
        (Array.isArray(confirmedPinIds) && confirmedPinIds.includes(pinId) ? 'still_flooded' : null)

      const hasVoted = Boolean(userVote)
      const isResolved = status === 'resolved'

      const totalFlooded = (Number(stillFloodedCount) || Number(confirmations) || 1)
      const totalCleared = Number(clearedCount) || 0

      const rawSeverityLabel = {
        caution: 'Ankle-deep — passable with caution',
        warning: 'Knee-deep — avoid if possible',
        danger:  'Road blocked — do not enter',
      }[severity] || 'Waterlogging report'
      const severityLabel = escapeHtml(rawSeverityLabel)
      const safeSeverity = escapeHtml(severity || 'caution')
      const safePinId = escapeHtml(pinId)

      const descHtml = isResolved
        ? `<div class="pin-popup__desc pin-popup__desc--resolved">
             <span class="pin-popup__severity-struck">${severityLabel}</span>
             <span class="pin-popup__cleared-tag">✓ Road Clear — Safe to Traverse</span>
           </div>`
        : `<div class="pin-popup__desc">${severityLabel}</div>`

      const timeText = escapeHtml(
        createdAt
          ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Just now'
      )

      // Real-time expiry countdown
      const nowSec = Math.floor(Date.now() / 1000)
      const remainingSec = expiresAt ? Math.max(0, expiresAt - nowSec) : null
      const remainingMins = remainingSec !== null ? Math.ceil(remainingSec / 60) : null

      let statusPillHtml = ''
      if (isResolved) {
        statusPillHtml = `<span class="pin-popup__status-pill pin-popup__status-pill--resolved">✅ Cleared</span>`
      } else if (remainingMins !== null && remainingMins > 0) {
        statusPillHtml = `<span class="pin-popup__status-pill pin-popup__status-pill--active" title="Auto-clears unless confirmed">⏳ ${remainingMins}m left</span>`
      } else if (remainingMins !== null && remainingMins === 0) {
        statusPillHtml = `<span class="pin-popup__status-pill pin-popup__status-pill--expired">🕒 Expiring</span>`
      }

      const commentHtml = comment
        ? `<div class="pin-popup__comment">"${escapeHtml(comment)}"</div>`
        : ''

      const isSafePhoto = isSafeMediaUrl(photoUrl)
      const safeConf = Math.round(Number(aiConfidence) || 0)
      const photoHtml = isSafePhoto
        ? `
          <div class="pin-popup__photo-box">
            <img src="${escapeHtml(photoUrl)}" alt="Flood incident" class="pin-popup__photo" loading="lazy" />
            ${aiVerified ? `
              <div class="pin-popup__ai-badge-overlay">
                <span>✓ AI Verified</span>
                ${safeConf > 0 ? `<span class="pin-popup__ai-conf">${safeConf}%</span>` : ''}
              </div>
            ` : ''}
          </div>
        `
        : ''

      const tagsHtml = Array.isArray(aiTags) && aiTags.length > 0
        ? `
          <div class="pin-popup__tags">
            ${aiTags.map((tag) => `<span class="pin-popup__tag">#${escapeHtml(tag)}</span>`).join('')}
          </div>
        `
        : ''

      const footerHtml = isResolved
        ? `
          <div class="pin-popup__resolved-banner">
            <div class="pin-popup__resolved-icon">✅</div>
            <div class="pin-popup__resolved-text">
              <strong>Water Cleared</strong>
              <span>Resolved by community consensus</span>
            </div>
          </div>
        `
        : `
          <div class="pin-popup__consensus-section">
            <div class="pin-popup__consensus-header">
              <span>Community Consensus</span>
              <span class="pin-popup__consensus-tally">${totalCleared}/2 votes to clear</span>
            </div>
            <div class="pin-popup__vote-grid">
              <button
                type="button"
                class="pin-popup__vote-btn pin-popup__vote-btn--flooded ${userVote === 'still_flooded' ? 'is-active' : ''}"
                data-action="vote-pin"
                data-vote-type="still_flooded"
                data-pin-id="${safePinId}"
                ${hasVoted ? 'disabled' : ''}
                title="${userVote === 'still_flooded' ? 'You confirmed this flood' : 'Vote flood is still active (+15-45m extension)'}"
              >
                <span class="pin-popup__vote-text">🌊 ${userVote === 'still_flooded' ? 'Confirmed' : 'Still Flooded'}</span>
                <span class="pin-popup__vote-badge">(${totalFlooded})</span>
              </button>

              <button
                type="button"
                class="pin-popup__vote-btn pin-popup__vote-btn--cleared ${userVote === 'cleared' ? 'is-active' : ''}"
                data-action="vote-pin"
                data-vote-type="cleared"
                data-pin-id="${safePinId}"
                ${hasVoted ? 'disabled' : ''}
                title="${userVote === 'cleared' ? 'You voted water cleared' : 'Vote water is cleared (2 votes to resolve)'}"
              >
                <span class="pin-popup__vote-text">✅ ${userVote === 'cleared' ? 'Voted' : 'Water Cleared'}</span>
                <span class="pin-popup__vote-badge">(${totalCleared}/2)</span>
              </button>
            </div>
          </div>
        `

      const popupContent = `
        <div class="pin-popup ${isResolved ? 'is-resolved' : ''}">
          ${photoHtml}
          <div class="pin-popup__header">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="pin-popup__badge pin-popup__badge--${safeSeverity}">${safeSeverity}</span>
              ${statusPillHtml}
            </div>
            <span class="pin-popup__time">🕒 ${timeText}</span>
          </div>
          ${descHtml}
          ${commentHtml}
          ${tagsHtml}
          <div class="pin-popup__footer">
            ${footerHtml}
          </div>
        </div>
      `

      L.marker([lat, lng], {
        icon: createPinIcon(severity, Boolean(photoUrl), Boolean(aiVerified), isResolved),
      })
        .bindPopup(popupContent, { className: 'aquapin-popup' })
        .addTo(markersLayerRef.current)
    })
  }, [pins, userVotes, confirmedPinIds])

  // 3. Listen for clicks on the consensus voting buttons in popups via event delegation
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleContainerClick = (e) => {
      const voteBtn = e.target.closest('[data-action="vote-pin"]')
      if (voteBtn) {
        if (voteBtn.disabled || voteBtn.classList.contains('is-active')) return
        const pinId = voteBtn.getAttribute('data-pin-id')
        const voteType = voteBtn.getAttribute('data-vote-type') || 'still_flooded'
        if (pinId) {
          if (onVotePin) onVotePin(pinId, voteType)
          else if (onConfirmPin) onConfirmPin(pinId)
        }
        return
      }

      // Backwards-compatible legacy confirm button
      const confirmBtn = e.target.closest('[data-action="confirm-pin"]')
      if (confirmBtn) {
        if (confirmBtn.disabled || confirmBtn.classList.contains('is-confirmed')) return
        const pinId = confirmBtn.getAttribute('data-pin-id')
        if (pinId) {
          if (onVotePin) onVotePin(pinId, 'still_flooded')
          else if (onConfirmPin) onConfirmPin(pinId)
        }
      }
    }

    container.addEventListener('click', handleContainerClick)
    return () => container.removeEventListener('click', handleContainerClick)
  }, [onVotePin, onConfirmPin])

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


