import http from 'http'
import { randomUUID } from 'crypto'
import { handler as postPinHandler } from './lambdas/postPin.js'
import { handler as getPinsHandler } from './lambdas/getPins.js'
import { analyzeFloodPhoto } from './services/aiVisionService.js'

const PORT = Number(process.env.PORT) || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'

// Security audit environment sanity check
if (NODE_ENV === 'production' && ALLOWED_ORIGIN === '*') {
  console.warn('[SECURITY WARNING] In production, ALLOWED_ORIGIN is set to "*". Set a specific domain in production.')
}

/**
 * Realistic Rapid Urban Response TTL (Option 1)
 */
const TTL_MINUTES = {
  caution: 30, // 30 mins
  warning: 60, // 60 mins (1 hr)
  danger: 90,  // 90 mins (1.5 hrs)
}

const EXTENSION_MINUTES = {
  caution: 15,
  warning: 30,
  danger: 45,
}

const MAX_LIFESPAN_MINUTES = 180 // 3 hours absolute ceiling from creation
const ALLOWED_SEVERITIES = ['caution', 'warning', 'danger']
const ALLOWED_VOTES = ['still_flooded', 'cleared']

const nowEpochSec = Math.floor(Date.now() / 1000)

/**
 * In-memory fallback pins for local testing when DynamoDB is offline
 */
const inMemoryStore = [
  {
    pinId: 'mock-1',
    lat: 28.7520,
    lng: 77.1150,
    severity: 'danger',
    comment: 'Road blocked near DTU Gate 1 (Submerged underpass)',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    expiresAt: nowEpochSec + (TTL_MINUTES.danger - 10) * 60,
    status: 'active',
    stillFloodedCount: 3,
    clearedCount: 0,
    confirmations: 3,
    aiVerified: true,
    aiConfidence: 96,
    aiTags: ['Severe Submersion', 'Road Impassable', 'Vehicle Hazard'],
    aiSummary: 'Critical flood depth detected: roadway appears completely impassable.',
    photoUrl: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=500&auto=format&fit=crop&q=80',
    voterIps: new Set(),
  },
  {
    pinId: 'mock-2',
    lat: 28.7480,
    lng: 77.1220,
    severity: 'warning',
    comment: 'Knee deep water near Bawana Road',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    expiresAt: nowEpochSec + (TTL_MINUTES.warning - 5) * 60,
    status: 'active',
    stillFloodedCount: 1,
    clearedCount: 0,
    confirmations: 1,
    voterIps: new Set(),
  },
  {
    pinId: 'mock-3',
    lat: 28.7510,
    lng: 77.1200,
    severity: 'caution',
    comment: 'Ankle deep puddle near Admin block',
    createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    expiresAt: nowEpochSec + (TTL_MINUTES.caution - 2) * 60,
    status: 'active',
    stillFloodedCount: 1,
    clearedCount: 0,
    confirmations: 1,
    voterIps: new Set(),
  },
  {
    pinId: 'mock-4',
    lat: 28.7460,
    lng: 77.1160,
    severity: 'danger',
    comment: 'Severe waterlogging, car stalled',
    createdAt: new Date().toISOString(),
    expiresAt: nowEpochSec + TTL_MINUTES.danger * 60,
    status: 'active',
    stillFloodedCount: 2,
    clearedCount: 0,
    confirmations: 2,
    voterIps: new Set(),
  },
  {
    pinId: 'mock-5',
    lat: 28.7500,
    lng: 77.1250,
    severity: 'caution',
    comment: 'Puddle drained, roadway clear',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    expiresAt: nowEpochSec + (TTL_MINUTES.caution - 5) * 60,
    status: 'resolved',
    resolvedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    stillFloodedCount: 1,
    clearedCount: 2,
    confirmations: 1,
    voterIps: new Set(),
  },
]

// ── In-Memory Rate Limiting (Token Bucket / Sliding Window) ──
const rateLimits = new Map()

/**
 * Checks if a client IP has exceeded the allowed rate
 * @param {string} ip
 * @param {string} bucket - Endpoint identifier
 * @param {number} maxRequests - Max requests allowed per window
 * @param {number} windowMs - Window duration in milliseconds
 * @returns {boolean} True if allowed, false if rate limited
 */
function checkRateLimit(ip, bucket, maxRequests = 10, windowMs = 60000) {
  const key = `${ip}:${bucket}`
  const now = Date.now()
  const record = rateLimits.get(key) || { count: 0, resetAt: now + windowMs }

  if (now > record.resetAt) {
    record.count = 1
    record.resetAt = now + windowMs
    rateLimits.set(key, record)
    return true
  }

  if (record.count >= maxRequests) {
    return false
  }

  record.count++
  rateLimits.set(key, record)
  return true
}

// Periodic cleanup of stale rate-limiting buckets
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of rateLimits.entries()) {
    if (now > record.resetAt) {
      rateLimits.delete(key)
    }
  }
}, 60000)

/**
 * Reads request body stream with an explicit byte-size ceiling (Anti-DoS)
 * @param {http.IncomingMessage} req
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
function readBodyWithLimit(req, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = ''
    let totalBytes = 0

    req.on('data', (chunk) => {
      totalBytes += chunk.length
      if (totalBytes > maxBytes) {
        req.destroy()
        const err = new Error('Payload Too Large')
        err.statusCode = 413
        reject(err)
        return
      }
      body += chunk
    })

    req.on('end', () => resolve(body))
    req.on('error', (err) => reject(err))
  })
}

/**
 * Validates whether an incoming photo payload is safe
 */
function isValidImagePayload(photo) {
  if (!photo || typeof photo !== 'string') return false
  if (photo.length > 5 * 1024 * 1024) return false
  if (photo.startsWith('https://')) return true
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(photo)) return true
  return false
}

/**
 * Set security headers on HTTP responses
 */
function setSecurityHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self)')
  res.removeHeader('X-Powered-By')
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1').split(',')[0].trim()
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = parsedUrl.pathname

  // ── Route: /pins or /api/pins ─────────────────────────────────
  if (pathname === '/pins' || pathname === '/api/pins') {
    if (req.method === 'GET') {
      const queryStringParameters = Object.fromEntries(parsedUrl.searchParams.entries())
      const event = {
        httpMethod: 'GET',
        queryStringParameters,
        path: pathname,
      }

      // Try invoking real Lambda handler first
      try {
        const response = await getPinsHandler(event)
        if (response.statusCode === 200) {
          res.writeHead(response.statusCode, response.headers)
          res.end(response.body)
          return
        }
      } catch {
        console.warn('[DevServer] DynamoDB not responding, using in-memory store.')
      }

      // Fallback: In-memory store (filter out expired pins)
      const nowEpoch = Math.floor(Date.now() / 1000)
      const activePins = inMemoryStore.filter((pin) => {
        if (pin.expiresAt && pin.expiresAt < nowEpoch) {
          return false
        }
        return true
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ count: activePins.length, pins: activePins }))
      return
    }

    if (req.method === 'POST') {
      // Rate Limit: 10 reports / minute per IP
      if (!checkRateLimit(clientIp, 'post_pin', 10, 60000)) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' })
        res.end(JSON.stringify({ error: 'Too many flood reports submitted. Please wait a minute.' }))
        return
      }

      let bodyData = ''
      try {
        bodyData = await readBodyWithLimit(req, 5 * 1024 * 1024)
      } catch (streamErr) {
        if (streamErr.statusCode === 413) {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Payload too large. Images must be under 5MB.' }))
          return
        }
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Malformed request stream' }))
        return
      }

      const event = {
        httpMethod: 'POST',
        body: bodyData,
        path: pathname,
      }

      // Try invoking real Lambda handler
      try {
        const response = await postPinHandler(event)
        if (response.statusCode === 201) {
          res.writeHead(response.statusCode, response.headers)
          res.end(response.body)
          return
        }
      } catch {
        console.warn('[DevServer] DynamoDB not responding, saving to in-memory store.')
      }

      // Fallback: In-memory store
      try {
        const parsed = JSON.parse(bodyData)
        const { lat, lng, severity, comment, photo } = parsed

        // Input validation
        if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid latitude. Must be a number between -90 and 90.' }))
          return
        }

        if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid longitude. Must be a number between -180 and 180.' }))
          return
        }

        if (!ALLOWED_SEVERITIES.includes(severity)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Invalid severity. Must be one of: ${ALLOWED_SEVERITIES.join(', ')}` }))
          return
        }

        let safePhoto = null
        if (photo) {
          if (!isValidImagePayload(photo)) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid photo format. Only HTTPS image URLs or Base64 images allowed.' }))
            return
          }
          safePhoto = photo
        }

        const sanitizedComment = comment
          ? String(comment).replace(/[^\x20-\x7E\t\n\r]/g, '').trim().slice(0, 200)
          : ''

        let aiResult = {
          aiVerified: false,
          aiConfidence: 0,
          aiTags: [],
          aiSummary: '',
        }

        if (safePhoto) {
          try {
            aiResult = await analyzeFloodPhoto({
              photoBase64: safePhoto,
              userSeverity: severity,
              comment: sanitizedComment,
              pixelMetrics: parsed.pixelMetrics || null,
            })
          } catch (err) {
            console.warn('[DevServer] AI analysis error:', err.message)
          }
        }

        const finalSeverity = aiResult.suggestedSeverity || severity || 'caution'
        const ttlMin = TTL_MINUTES[finalSeverity] || 60
        const nowSec = Math.floor(Date.now() / 1000)
        const expiresAt = nowSec + ttlMin * 60

        const newPin = {
          pinId: `local-${Date.now()}`,
          lat: Number(lat.toFixed(5)),
          lng: Number(lng.toFixed(5)),
          severity: finalSeverity,
          comment: sanitizedComment,
          createdAt: new Date().toISOString(),
          expiresAt,
          status: 'active',
          stillFloodedCount: 1,
          clearedCount: 0,
          confirmations: 1,
          photoUrl: safePhoto,
          aiVerified: Boolean(aiResult.aiVerified),
          aiConfidence: aiResult.aiConfidence || 0,
          aiTags: aiResult.aiTags || [],
          aiSummary: aiResult.aiSummary || '',
          voterIps: new Set([clientIp]),
        }
        inMemoryStore.unshift(newPin)

        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'Pin created (dev store)', pin: newPin }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      }
      return
    }
  }

  // ── Route: Real-time AI Photo Analysis (/api/analyze-photo or /pins/analyze) ──
  if ((pathname === '/api/analyze-photo' || pathname === '/pins/analyze') && req.method === 'POST') {
    // Rate Limit: 15 photo analyses / minute per IP
    if (!checkRateLimit(clientIp, 'analyze_photo', 15, 60000)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' })
      res.end(JSON.stringify({ error: 'Rate limit exceeded for photo analysis. Please slow down.' }))
      return
    }

    let bodyData = ''
    try {
      bodyData = await readBodyWithLimit(req, 5 * 1024 * 1024)
    } catch (streamErr) {
      if (streamErr.statusCode === 413) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Payload too large. Images must be under 5MB.' }))
        return
      }
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Malformed request stream' }))
      return
    }

    try {
      const parsed = JSON.parse(bodyData || '{}')
      if (parsed.photo && !isValidImagePayload(parsed.photo)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid photo payload format' }))
        return
      }

      const analysis = await analyzeFloodPhoto({
        photoBase64: parsed.photo,
        userSeverity: parsed.severity,
        comment: parsed.comment ? String(parsed.comment).slice(0, 200) : '',
        pixelMetrics: parsed.pixelMetrics || null,
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(analysis))
    } catch (err) {
      const correlationId = randomUUID()
      console.error(`[DevServer][${correlationId}] Failed to analyze photo:`, err.message)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to analyze photo', correlationId }))
    }
    return
  }

  // ── Route: Community Consensus Voting (/pins/:pinId/vote or /pins/:pinId/confirm) ──
  const voteMatch = pathname.match(/^\/(?:api\/)?pins\/([^/]+)\/(?:vote|confirm)$/)
  if (voteMatch && req.method === 'POST') {
    const rawPinId = voteMatch[1]

    // Sanitize pinId to alphanumeric and safe hyphens
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(rawPinId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid pin identifier format.' }))
      return
    }
    const pinId = decodeURIComponent(rawPinId)

    // Rate Limit: 20 votes / minute per IP
    if (!checkRateLimit(clientIp, 'vote_pin', 20, 60000)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' })
      res.end(JSON.stringify({ error: 'Voting rate limit exceeded. Please wait a moment.' }))
      return
    }

    let bodyData = ''
    try {
      bodyData = await readBodyWithLimit(req, 64 * 1024)
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid request body' }))
      return
    }

    let voteType = 'still_flooded'
    try {
      if (bodyData) {
        const parsed = JSON.parse(bodyData)
        if (parsed.voteType) voteType = parsed.voteType
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }))
      return
    }

    if (!ALLOWED_VOTES.includes(voteType)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Invalid voteType. Must be one of: ${ALLOWED_VOTES.join(', ')}` }))
      return
    }

    const pin = inMemoryStore.find((p) => p.pinId === pinId)
    if (!pin) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Pin not found' }))
      return
    }

    // Disallow voting on already resolved flood incidents
    if (pin.status === 'resolved') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'This waterlogging report has already been resolved and cleared.' }))
      return
    }

    // Prevent duplicate votes from the same IP on the same pin
    if (!pin.voterIps) pin.voterIps = new Set()
    if (pin.voterIps.has(clientIp)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Your vote has already been recorded for this pin.' }))
      return
    }
    pin.voterIps.add(clientIp)

    const nowSec = Math.floor(Date.now() / 1000)

    if (voteType === 'still_flooded') {
      pin.stillFloodedCount = (pin.stillFloodedCount || 0) + 1
      pin.confirmations = pin.stillFloodedCount
      pin.lastVotedAt = new Date().toISOString()

      // Dynamic extension: add +15 / +30 / +45 mins based on severity
      const extensionSec = (EXTENSION_MINUTES[pin.severity] || 30) * 60
      const createdSec = pin.createdAt ? Math.floor(new Date(pin.createdAt).getTime() / 1000) : nowSec
      const maxAllowedExpiresAt = createdSec + MAX_LIFESPAN_MINUTES * 60
      const currentExpiresAt = pin.expiresAt && pin.expiresAt > nowSec ? pin.expiresAt : nowSec
      pin.expiresAt = Math.min(currentExpiresAt + extensionSec, maxAllowedExpiresAt)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          message: `Flood status confirmed! Expiry extended by ${EXTENSION_MINUTES[pin.severity] || 30}m.`,
          pin,
          voteType: 'still_flooded',
          resolved: pin.status === 'resolved',
        })
      )
      return
    }

    if (voteType === 'cleared') {
      pin.clearedCount = (pin.clearedCount || 0) + 1
      pin.lastVotedAt = new Date().toISOString()

      // Consensus threshold: 2 community votes mark the flood as cleared
      const isResolved = pin.clearedCount >= 2
      if (isResolved) {
        pin.status = 'resolved'
        pin.resolvedAt = new Date().toISOString()
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          message: isResolved
            ? 'Community consensus reached: Water marked cleared!'
            : `Clearance vote recorded (${2 - pin.clearedCount} more vote needed to resolve).`,
          pin,
          voteType: 'cleared',
          resolved: isResolved,
        })
      )
      return
    }
  }

  // ── Route: Health Check (/health) ────────────────────────────
  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'AquaPin Backend' }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Endpoint not found' }))
})

server.listen(PORT, () => {
  console.log(`[AquaPin Backend] Server running at http://localhost:${PORT}`)
  console.log(`[AquaPin Backend] Endpoints: GET /pins | POST /pins | POST /pins/:pinId/vote | GET /health`)
})
