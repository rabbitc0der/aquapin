import http from 'http'
import { handler as postPinHandler } from './lambdas/postPin.js'
import { handler as getPinsHandler } from './lambdas/getPins.js'

const PORT = process.env.PORT || 3001

/**
 * In-memory fallback pins for local testing when DynamoDB is offline
 */
const inMemoryStore = [
  {
    pinId: 'mock-1',
    lat: 28.7520,
    lng: 77.1150,
    severity: 'danger',
    comment: 'Road blocked near DTU Gate 1',
    createdAt: new Date().toISOString(),
    status: 'active',
  },
  {
    pinId: 'mock-2',
    lat: 28.7480,
    lng: 77.1220,
    severity: 'warning',
    comment: 'Knee deep water near Bawana Road',
    createdAt: new Date().toISOString(),
    status: 'active',
  },
  {
    pinId: 'mock-3',
    lat: 28.7510,
    lng: 77.1200,
    severity: 'caution',
    comment: 'Ankle deep puddle near Admin block',
    createdAt: new Date().toISOString(),
    status: 'active',
  },
  {
    pinId: 'mock-4',
    lat: 28.7460,
    lng: 77.1160,
    severity: 'danger',
    comment: 'Severe waterlogging, car stalled',
    createdAt: new Date().toISOString(),
    status: 'active',
  },
  {
    pinId: 'mock-5',
    lat: 28.7500,
    lng: 77.1250,
    severity: 'caution',
    comment: 'Passable slowly',
    createdAt: new Date().toISOString(),
    status: 'active',
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

      // Fallback: In-memory store
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ count: inMemoryStore.length, pins: inMemoryStore }))
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
          const newPin = {
            pinId: `local-${Date.now()}`,
            lat: parsed.lat,
            lng: parsed.lng,
            severity: parsed.severity,
            comment: parsed.comment || '',
            createdAt: new Date().toISOString(),
            status: 'active',
            confirmations: 0,
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

  // Confirm pin endpoint (/pins/:pinId/confirm)
  const confirmMatch = pathname.match(/^\/(?:api\/)?pins\/([^/]+)\/confirm$/)
  if (confirmMatch && req.method === 'POST') {
    const pinId = decodeURIComponent(confirmMatch[1])
    const pin = inMemoryStore.find((p) => p.pinId === pinId)
    if (pin) {
      pin.confirmations = (pin.confirmations || 0) + 1
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'Pin confirmed', pin }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Pin confirmed (generic)', pinId }))
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
