import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from '../db/dynamoClient.js'

/**
 * Standard CORS headers for API Gateway responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
}

/**
 * AWS Lambda Handler — GET /pins
 *
 * Retrieves active waterlogging pins from DynamoDB.
 * Supports optional bounding box query params:
 * ?minLat=28.7&maxLat=28.8&minLng=77.1&maxLng=77.2
 */
export async function handler(event) {
  console.log('[getPins] Event received:', JSON.stringify(event))

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

    // Scan DynamoDB for active pins (for production scale, GeoHash or GSI can be used)
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

    // Apply optional bounding box filter if params are provided
    if (minLat && maxLat && minLng && maxLng) {
      const minLt = parseFloat(minLat)
      const maxLt = parseFloat(maxLat)
      const minLg = parseFloat(minLng)
      const maxLg = parseFloat(maxLng)

      pins = pins.filter(
        (pin) =>
          pin.lat >= minLt &&
          pin.lat <= maxLt &&
          pin.lng >= minLg &&
          pin.lng <= maxLg
      )
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
    console.error('[getPins] Error querying DynamoDB:', error)
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Failed to retrieve pins',
        details: error.message,
      }),
    }
  }
}
