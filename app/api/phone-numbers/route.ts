import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'

async function GET(request: NextRequest) {
  try {
    // Use the real Vapi phone number ID from environment or default from n8n workflow
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || '0c07692a-db4d-4a56-a895-4debafc213fe'
    
    // For MVP, return the configured phone number
    // In the future, this could fetch from Vapi API to get all available numbers
    const phoneNumbers = [
      {
        id: phoneNumberId,
        number: process.env.VAPI_PHONE_NUMBER_DISPLAY || '+1 (519) 981-5710', // User can set display number
        provider: 'Vapi'
      }
    ]

    return NextResponse.json(phoneNumbers)
    
  } catch (error: any) {
    console.error('Phone numbers fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch phone numbers' },
      { status: 500 }
    )
  }
}

// Export with auth wrapper
const authGetHandler = withAuth(GET)
export { authGetHandler as GET }