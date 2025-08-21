import { NextRequest, NextResponse } from 'next/server'
import { bulletproofSessionStorage as sessionStorage } from '@/lib/session-storage-v2'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')
  
  console.log(`🔍 VALIDATION (NO AUTH): Checking session ${sessionId}`)
  
  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session ID is required' },
      { status: 400 }
    )
  }
  
  const validation = await sessionStorage.retrieve(sessionId)
  
  if (!validation) {
    return NextResponse.json(
      { error: 'Session not found or expired' },
      { status: 404 }
    )
  }
  
  console.log(`✅ VALIDATION (NO AUTH): Found session ${sessionId} with ${validation.valid?.length} contacts`)
  
  return NextResponse.json({
    sessionId,
    validation,
    success: true
  })
}