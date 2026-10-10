import { randomUUID } from 'crypto'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from '../db/dynamoClient.js'
import { analyzeFloodPhoto } from '../services/aiVisionService.js'

/**
 * Standard CORS headers for API Gateway responses
 */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
}

const ALLOWED_SEVERITIES = ['caution', 'warning', 'danger']
// Rapid Urban Response TTL (Option 1)
const TTL_MINUTES = {
  caution: 30, // 30 mins
  warning: 60, // 60 mins (1 hr)
  danger: 90,  // 90 mins (1.5 hrs)
}

/**
 * AWS Lambda Handler — POST /pins
 *
 * Saves a waterlogging report pin into DynamoDB.
 *
 * Expected payload:
 * {
 *   "lat": 28.7497,
 *   "lng": 77.1183,
 *   "severity": "danger" | "warning" | "caution",
 *   "comment": "Water above knee" (optional),
 *   "photo": "data:image/jpeg;base64,..." (optional)
 * }
 */
export async function handler(event) {
  console.log('[postPin] Event received:', JSON.stringify(event))

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    }
  }

  try {
    let body = event.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch (err) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid JSON body' }),
        }
      }
    }

    const { lat, lng, severity, comment, photo } = body || {}

    // Validation
    if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid latitude. Must be a number between -90 and 90.' }),
      }
    }

    if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid longitude. Must be a number between -180 and 180.' }),
      }
    }

    if (!ALLOWED_SEVERITIES.includes(severity)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: `Invalid severity. Must be one of: ${ALLOWED_SEVERITIES.join(', ')}`,
        }),
      }
    }

    // Optional AI Photo Verification
    let aiResult = {
      aiVerified: false,
      aiConfidence: 0,
      aiTags: [],
      aiSummary: '',
    }

    if (photo) {
      try {
        aiResult = await analyzeFloodPhoto({
          photoBase64: photo,
          userSeverity: severity,
          comment: comment || '',
        })
      } catch (aiErr) {
        console.warn('[postPin] AI verification non-blocking error:', aiErr)
      }
    }

    const now = new Date()
    const pinId = `pin_${randomUUID()}`
    const createdAt = now.toISOString()
    const finalSeverity = aiResult.suggestedSeverity || severity
    const ttlMin = TTL_MINUTES[finalSeverity] || 60
    // TTL in epoch seconds for DynamoDB TTL automatic cleanup
    const expiresAt = Math.floor(now.getTime() / 1000) + ttlMin * 60

    const pinItem = {
      pinId,
      lat,
      lng,
      severity: finalSeverity,
      comment: comment ? String(comment).slice(0, 200) : '',
      createdAt,
      expiresAt,
      status: 'active',
      stillFloodedCount: 1,
      clearedCount: 0,
      confirmations: 1,
      upvotes: 1,
      photoUrl: photo || null,
      aiVerified: Boolean(aiResult.aiVerified),
      aiConfidence: aiResult.aiConfidence || 0,
      aiTags: aiResult.aiTags || [],
      aiSummary: aiResult.aiSummary || '',
    }

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: pinItem,
    })

    await docClient.send(command)

    console.log('[postPin] Saved successfully:', pinId)

    return {
      statusCode: 201,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Pin created successfully',
        pin: pinItem,
      }),
    }
  } catch (error) {
    console.error('[postPin] Error writing to DynamoDB:', error)
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Failed to record pin',
        details: error.message,
      }),
    }
  }
}
