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
 * @param {Object} pinData - { lat, lng, severity, comment }
 * @returns {Promise<Object>} Created pin object
 */
export async function postPin({ lat, lng, severity, comment }) {
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
 * Confirm a waterlogging pin ("Still Flooded?" upvote)
 * @param {string} pinId
 * @returns {Promise<Object>}
 */
export async function confirmPin(pinId) {
  try {
    const res = await fetch(`${API_BASE_URL}/pins/${encodeURIComponent(pinId)}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (error) {
    console.warn('[AquaPin API] confirmPin request warning:', error)
  }
  return { success: true }
}

