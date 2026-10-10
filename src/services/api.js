/**
 * AquaPin API Service
 *
 * Interfaces with the AquaPin backend (AWS API Gateway or local dev server).
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

/**
 * Fetch all active pins from the backend
 * @returns {Promise<Array>} List of pin objects
 */
export async function getPins() {
  try {
    const res = await fetch(`${API_BASE_URL}/pins`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch pins: ${res.statusText}`)
    }

    const data = await res.json()
    return data.pins || []
  } catch (error) {
    console.warn('[AquaPin API] getPins network error, using fallback:', error)
    // Return empty array or throw depending on consumer handling
    return []
  }
}

/**
 * Submit a new waterlogging pin
 * @param {Object} pinData - { lat, lng, severity, comment, photo, pixelMetrics }
 * @returns {Promise<Object>} Created pin object
 */
export async function postPin({ lat, lng, severity, comment, photo, pixelMetrics = null }) {
  const res = await fetch(`${API_BASE_URL}/pins`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lat: Number(lat),
      lng: Number(lng),
      severity,
      comment: comment || '',
      photo: photo || null,
      pixelMetrics: pixelMetrics || null,
    }),
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Failed to submit pin: ${res.statusText}`)
  }

  const data = await res.json()
  return data.pin
}

/**
 * Pre-submit AI Photo Analysis
 * @param {Object} params - { photo, severity, comment, pixelMetrics }
 * @returns {Promise<Object>} AI analysis details
 */
export async function analyzePhoto({ photo, severity = 'caution', comment = '', pixelMetrics = null }) {
  const res = await fetch(`${API_BASE_URL}/api/analyze-photo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      photo,
      severity,
      comment,
      pixelMetrics,
    }),
  })

  if (!res.ok) {
    throw new Error('AI analysis failed')
  }

  return await res.json()
}

/**
 * Submit community consensus vote on a pin
 * @param {string} pinId
 * @param {'still_flooded' | 'cleared'} voteType
 * @returns {Promise<Object>}
 */
export async function votePin(pinId, voteType = 'still_flooded') {
  try {
    const res = await fetch(`${API_BASE_URL}/pins/${encodeURIComponent(pinId)}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ voteType }),
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (error) {
    console.warn('[AquaPin API] votePin request warning:', error)
  }
  return { success: false }
}

/**
 * Confirm a waterlogging pin ("Still Flooded?" upvote) - legacy wrapper
 * @param {string} pinId
 * @returns {Promise<Object>}
 */
export async function confirmPin(pinId) {
  return votePin(pinId, 'still_flooded')
}

