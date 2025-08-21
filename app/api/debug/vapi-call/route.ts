import { NextRequest, NextResponse } from 'next/server'
import { vapiClient } from '@/lib/vapi-client'

export async function POST(request: NextRequest) {
  try {
    const { callId } = await request.json()
    
    if (!callId) {
      return NextResponse.json({ error: 'callId required' }, { status: 400 })
    }

    console.log(`🔍 DEBUGGING VAPI CALL: ${callId}`)
    
    // Get raw response from Vapi
    const vapiResponse = await vapiClient.getCall(callId)
    
    console.log('Raw Vapi Response:', JSON.stringify(vapiResponse, null, 2))
    
    return NextResponse.json({
      callId,
      timestamp: new Date().toISOString(),
      raw_vapi_response: vapiResponse,
      status_analysis: {
        current_status: vapiResponse?.status,
        status_type: typeof vapiResponse?.status,
        all_fields: vapiResponse ? Object.keys(vapiResponse) : [],
        critical_fields: {
          id: vapiResponse?.id,
          status: vapiResponse?.status,
          phoneNumber: vapiResponse?.phoneNumber,
          startedAt: vapiResponse?.startedAt,
          endedAt: vapiResponse?.endedAt,
          cost: vapiResponse?.cost,
          transcript: vapiResponse?.transcript ? 'present' : 'missing',
          recordingUrl: vapiResponse?.recordingUrl ? 'present' : 'missing'
        }
      }
    })
    
  } catch (error) {
    console.error('Vapi debug error:', error)
    return NextResponse.json({
      error: 'Vapi debug failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}