import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

/**
 * DynamoDB Client Configuration
 * Supports:
 * - Real AWS execution (IAM role / AWS credentials in environment)
 * - LocalStack / DynamoDB Local (via DYNAMODB_ENDPOINT env var)
 */
const region = process.env.AWS_REGION || 'ap-south-1'
const endpoint = process.env.DYNAMODB_ENDPOINT || undefined

const baseClient = new DynamoDBClient({
  region,
  ...(endpoint ? { endpoint } : {}),
})

export const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

export const TABLE_NAME = process.env.TABLE_NAME || 'aquapin-pins'
