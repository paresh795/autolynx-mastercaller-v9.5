import { NextRequest, NextResponse } from 'next/server'
import { bulletproofSessionStorage } from '@/lib/session-storage-v2'

export async function GET(request: NextRequest) {
  try {
    const stats = await bulletproofSessionStorage.getStats()
    const sessionIds = await bulletproofSessionStorage.getAllSessionIds()
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      stats,
      sessionIds,
      success: true
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, sessionId } = await request.json()
    
    if (action === 'refresh') {
      await bulletproofSessionStorage.refresh()
      return NextResponse.json({
        message: 'Session storage refreshed from disk',
        timestamp: new Date().toISOString()
      })
    }
    
    if (action === 'test_store') {
      const testSessionId = `test_${Date.now()}`
      const testValidation = {
        valid: [
          { name: 'Test User', business_name: 'Test Corp', phone: '+1234567890', phone_original: '123-456-7890' }
        ],
        invalid: [],
        summary: { totalRows: 1, validRows: 1, invalidRows: 0, duplicates: 0 }
      }
      
      await bulletproofSessionStorage.store(testSessionId, testValidation)
      
      // Immediately try to retrieve it
      const retrieved = await bulletproofSessionStorage.retrieve(testSessionId)
      
      return NextResponse.json({
        message: 'Test session created and retrieved',
        testSessionId,
        retrieved: !!retrieved,
        retrievedData: retrieved,
        timestamp: new Date().toISOString()
      })
    }
    
    if (action === 'retrieve' && sessionId) {
      const validation = await bulletproofSessionStorage.retrieve(sessionId)
      return NextResponse.json({
        sessionId,
        found: !!validation,
        validation,
        timestamp: new Date().toISOString()
      })
    }
    
    return NextResponse.json({
      error: 'Invalid action or missing parameters',
      availableActions: ['refresh', 'test_store', 'retrieve']
    }, { status: 400 })
    
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}