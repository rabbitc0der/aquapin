import http from 'http'
import { handler as postPinHandler } from './lambdas/postPin.js'
import { handler as getPinsHandler } from './lambdas/getPins.js'
import { analyzeFloodPhoto } from './services/aiVisionService.js'

const PORT = process.env.PORT || 3001

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
  },
]

const server = http.createServer(async (req, res) => {
  // Common CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = parsedUrl.pathname

  if (pathname === '/pins' || pathname === '/api/pins') {
    if (req.method === 'GET') {
      const queryStringParameters = Object.fromEntries(parsedUrl.searchParams.entries())
      const event = {
        httpMethod: 'GET',
        queryStringParameters,
      }

      // Try invoking real Lambda handler first
      try {
        const response = await getPinsHandler(event)
        if (response.statusCode === 200) {
          res.writeHead(response.statusCode, response.headers)
          res.end(response.body)
          return
        }
      } catch (_err) {
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
      let bodyData = ''
      req.on('data', (chunk) => {
        bodyData += chunk
      })

      req.on('end', async () => {
        const event = {
          httpMethod: 'POST',
          body: bodyData,
        }

        // Try invoking real Lambda handler
        try {
          const response = await postPinHandler(event)
          if (response.statusCode === 201) {
            res.writeHead(response.statusCode, response.headers)
            res.end(response.body)
            return
          }
        } catch (_err) {
          console.warn('[DevServer] DynamoDB not responding, saving to in-memory store.')
        }

        // Fallback: In-memory store
        try {
          const parsed = JSON.parse(bodyData)
          let aiResult = {
            aiVerified: false,
            aiConfidence: 0,
            aiTags: [],
            aiSummary: '',
          }

          if (parsed.photo) {
            try {
              aiResult = await analyzeFloodPhoto({
                photoBase64: parsed.photo,
                userSeverity: parsed.severity,
                comment: parsed.comment || '',
                pixelMetrics: parsed.pixelMetrics || null,
              })
            } catch (err) {
              console.warn('[DevServer] AI analysis error:', err.message)
            }
          }

          const finalSeverity = aiResult.suggestedSeverity || parsed.severity || 'caution'
          const ttlMin = TTL_MINUTES[finalSeverity] || 60
          const nowSec = Math.floor(Date.now() / 1000)
          const expiresAt = nowSec + ttlMin * 60

          const newPin = {
            pinId: `local-${Date.now()}`,
            lat: parsed.lat,
            lng: parsed.lng,
            severity: finalSeverity,
            comment: parsed.comment || '',
            createdAt: new Date().toISOString(),
            expiresAt,
            status: 'active',
            stillFloodedCount: 1,
            clearedCount: 0,
            confirmations: 1,
            photoUrl: parsed.photo || null,
            aiVerified: Boolean(aiResult.aiVerified),
            aiConfidence: aiResult.aiConfidence || 0,
            aiTags: aiResult.aiTags || [],
            aiSummary: aiResult.aiSummary || '',
          }
          inMemoryStore.unshift(newPin)

          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: 'Pin created (dev store)', pin: newPin }))
        } catch (_e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        }
      })
      return
    }
  }

  // Real-time AI Photo Analysis endpoint (/api/analyze-photo or /pins/analyze)
  if ((pathname === '/api/analyze-photo' || pathname === '/pins/analyze') && req.method === 'POST') {
    let bodyData = ''
    req.on('data', (chunk) => {
      bodyData += chunk
    })

    req.on('end', async () => {
      try {
        const parsed = JSON.parse(bodyData || '{}')
        const analysis = await analyzeFloodPhoto({
          photoBase64: parsed.photo,
          userSeverity: parsed.severity,
          comment: parsed.comment,
          pixelMetrics: parsed.pixelMetrics || null,
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(analysis))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to analyze photo', details: err.message }))
      }
    })
    return
  }

  // Community Consensus Voting endpoint (/pins/:pinId/vote or /pins/:pinId/confirm)
  const voteMatch = pathname.match(/^\/(?:api\/)?pins\/([^/]+)\/(?:vote|confirm)$/)
  if (voteMatch && req.method === 'POST') {
    const pinId = decodeURIComponent(voteMatch[1])
    let bodyData = ''
    req.on('data', (chunk) => {
      bodyData += chunk
    })

    req.on('end', () => {
      let voteType = 'still_flooded'
      try {
        if (bodyData) {
          const parsed = JSON.parse(bodyData)
          if (parsed.voteType) voteType = parsed.voteType
        }
      } catch (_) {}

      const pin = inMemoryStore.find((p) => p.pinId === pinId)
      if (!pin) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Pin not found', pinId }))
        return
      }

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

      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Invalid voteType: ${voteType}` }))
    })
    return
  }


  // Health check endpoint
  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'AquaPin Backend' }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log(`[AquaPin Backend] Server running at http://localhost:${PORT}`)
  console.log(`[AquaPin Backend] Endpoints: GET /pins | POST /pins | GET /health`)
})
