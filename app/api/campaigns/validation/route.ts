import { NextRequest, NextResponse } from 'next/server'
import { bulletproofSessionStorage as sessionStorage } from '@/lib/session-storage-v2'

export async function GET(request: NextRequest) {
  console.log(`🔍 VALIDATION API v2: Starting validation check`)
  
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')
  
  if (!sessionId) {
    console.log(`❌ VALIDATION ERROR: No session ID provided`)
    return NextResponse.json(
      { error: 'Session ID is required' },
      { status: 400 }
    )
  }
  
  console.log(`🎯 VALIDATION API v2: Checking session ${sessionId}`)
  
  const validation = await sessionStorage.retrieve(sessionId)
  
  if (!validation) {
    console.log(`❌ VALIDATION ERROR: Session ${sessionId} not found or expired`)
    return NextResponse.json(
      { error: 'Session not found or expired' },
      { status: 404 }
    )
  }
  
  console.log(`✅ VALIDATION SUCCESS: Session ${sessionId} found with ${validation.valid?.length || 0} contacts`)
  
  return NextResponse.json({
    sessionId,
    validation,
    success: true,
    timestamp: new Date().toISOString()
  })
}