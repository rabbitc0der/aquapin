import { randomUUID } from 'crypto'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from '../db/dynamoClient.js'

/**
 * Standard CORS and Security headers for API Gateway responses
 */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

/**
 * AWS Lambda Handler — GET /pins
 *
 * Retrieves active waterlogging pins from DynamoDB.
 * Supports optional bounding box query params:
 * ?minLat=28.7&maxLat=28.8&minLng=77.1&maxLng=77.2
 */
export async function handler(event) {
  // Redact personal request payload and log only route metadata
  console.log('[getPins] Request received: method=%s, path=%s', event.httpMethod, event.rawPath || event.path)

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    }
  }

  try {
    const queryParams = event.queryStringParameters || {}
    const { minLat, maxLat, minLng, maxLng } = queryParams

    const nowEpoch = Math.floor(Date.now() / 1000)

    // Scan DynamoDB for active pins (bounded limit of 100 to prevent resource exhaustion)
    const scanCommand = new ScanCommand({
      TableName: TABLE_NAME,
      Limit: 100,
    })

    const result = await docClient.send(scanCommand)
    let pins = result.Items || []

    // Filter out expired pins if TTL has passed
    pins = pins.filter((pin) => {
      if (pin.expiresAt && pin.expiresAt < nowEpoch) {
        return false
      }
      return pin.status !== 'resolved'
    })

    // Apply optional bounding box filter if valid numeric params are provided
    if (minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined) {
      const minLt = parseFloat(minLat)
      const maxLt = parseFloat(maxLat)
      const minLg = parseFloat(minLng)
      const maxLg = parseFloat(maxLng)

      if (!isNaN(minLt) && !isNaN(maxLt) && !isNaN(minLg) && !isNaN(maxLg)) {
        pins = pins.filter(
          (pin) =>
            pin.lat >= minLt &&
            pin.lat <= maxLt &&
            pin.lng >= minLg &&
            pin.lng <= maxLg
        )
      }
    }

    // Sort newest first
    pins.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        count: pins.length,
        pins,
      }),
    }
  } catch (error) {
    const correlationId = randomUUID()
    console.error(`[getPins][${correlationId}] Error querying DynamoDB:`, error)
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Failed to retrieve pins due to internal server error',
        correlationId,
      }),
    }
  }
}
