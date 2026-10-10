import { randomUUID } from 'crypto'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from '../db/dynamoClient.js'
import { analyzeFloodPhoto } from '../services/aiVisionService.js'

/**
 * Standard CORS headers for API Gateway responses
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

const ALLOWED_SEVERITIES = ['caution', 'warning', 'danger']
// Rapid Urban Response TTL (Option 1)
const TTL_MINUTES = {
  caution: 30, // 30 mins
  warning: 60, // 60 mins (1 hr)
  danger: 90,  // 90 mins (1.5 hrs)
}

/**
 * Validates whether an incoming photo payload is a legitimate image URI
 */
function isValidImagePayload(photo) {
  if (!photo || typeof photo !== 'string') return false
  if (photo.length > 5 * 1024 * 1024) return false // 5MB cap
  if (photo.startsWith('https://')) return true
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(photo)) return true
  return false
}

/**
 * AWS Lambda Handler — POST /pins
 *
 * Saves a waterlogging report pin into DynamoDB.
 */
export async function handler(event) {
  // Redact personal request payload and log only route metadata
  console.log('[postPin] Request received: method=%s, path=%s', event.httpMethod, event.rawPath || event.path)

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
      } catch {
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

    // Photo validation (prevent arbitrary executable or HTML injection)
    let safePhoto = null
    if (photo) {
      if (!isValidImagePayload(photo)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid image format. Allowed formats: HTTPS image URL or Base64 data:image/(jpeg|png|webp).' }),
        }
      }
      safePhoto = photo
    }

    // Sanitize comment to printable characters only
    const sanitizedComment = comment
      ? String(comment).replace(/[^\x20-\x7E\t\n\r]/g, '').trim().slice(0, 200)
      : ''

    // Optional AI Photo Verification
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
        })
      } catch (aiErr) {
        console.warn('[postPin] AI verification non-blocking error:', aiErr?.message || 'Processing warning')
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
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      severity: finalSeverity,
      comment: sanitizedComment,
      createdAt,
      expiresAt,
      status: 'active',
      stillFloodedCount: 1,
      clearedCount: 0,
      confirmations: 1,
      upvotes: 1,
      photoUrl: safePhoto,
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

    console.log('[postPin] Saved successfully: %s', pinId)

    return {
      statusCode: 201,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Pin created successfully',
        pin: pinItem,
      }),
    }
  } catch (error) {
    const correlationId = randomUUID()
    console.error(`[postPin][${correlationId}] Error writing to DynamoDB:`, error)
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Failed to record pin due to internal server error',
        correlationId,
      }),
    }
  }
}
