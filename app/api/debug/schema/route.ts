import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET() {
  try {
    console.log('🔍 DEBUGGING DATABASE SCHEMA')
    
    // Get sample record to understand actual schema
    console.log('Fetching sample calls to check schema...')

    // Get recent calls with all available data
    const { data: recentCalls, error: callsError } = await supabaseAdmin
      .from('calls')
      .select('*')
      .order('id', { ascending: false })
      .limit(3)

    const response = {
      timestamp: new Date().toISOString(),
      schema_check: {
        method: 'table_sample',
        available_columns: recentCalls?.[0] ? Object.keys(recentCalls[0]) : [],
        error: callsError?.message
      },
      recent_calls: recentCalls?.map(call => ({
        id: call.id,
        status: call.status,
        provider_call_id: call.provider_call_id,
        available_fields: Object.keys(call)
      })),
      diagnosis: {
        total_calls: recentCalls?.length || 0,
        schema_available: !callsError,
        critical_fields: {
          id: recentCalls?.[0]?.hasOwnProperty('id') || false,
          status: recentCalls?.[0]?.hasOwnProperty('status') || false,
          provider_call_id: recentCalls?.[0]?.hasOwnProperty('provider_call_id') || false,
          created_at: recentCalls?.[0]?.hasOwnProperty('created_at') || false,
          started_at: recentCalls?.[0]?.hasOwnProperty('started_at') || false,
          ended_at: recentCalls?.[0]?.hasOwnProperty('ended_at') || false,
          transcript_json: recentCalls?.[0]?.hasOwnProperty('transcript_json') || false,
          recording_url: recentCalls?.[0]?.hasOwnProperty('recording_url') || false
        }
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Schema debug error:', error)
    return NextResponse.json({
      error: 'Schema debug failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}