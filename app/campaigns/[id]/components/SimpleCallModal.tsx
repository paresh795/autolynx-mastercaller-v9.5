'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'

interface SimpleCallModalProps {
  isOpen: boolean
  onClose: () => void
  callId: string | null
  contactName: string
}

export default function SimpleCallModal({ isOpen, onClose, callId, contactName }: SimpleCallModalProps) {
  const [callData, setCallData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen && callId) {
      fetchCallData()
    }
  }, [isOpen, callId])

  const fetchCallData = async () => {
    if (!callId) return
    
    setLoading(true)
    setError('')
    
    try {
      console.log(`🔍 MODAL: Fetching call data for ${callId}`)
      
      // Get the current session for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        throw new Error('Authentication required. Please log in again.')
      }
      
      const response = await fetch(`/api/calls/${callId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      
      console.log(`📡 MODAL: Response status ${response.status}`)
      
      if (response.status === 401) {
        throw new Error('Authentication expired. Please refresh the page and log in again.')
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to fetch call details: ${response.status}`)
      }
      
      const data = await response.json()
      console.log(`✅ MODAL: Call data received:`, data)
      setCallData(data)
      
    } catch (error) {
      console.error('❌ MODAL ERROR:', error)
      setError(`Error loading call details: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-500 bg-opacity-75">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
          {/* Header */}
          <div className="bg-gray-50 px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Call Details - {contactName}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-96 overflow-y-auto">
            {loading && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading call details...</p>
              </div>
            )}

            {error && (
              <div className="text-center py-8">
                <div className="text-red-600 mb-4">❌ {error}</div>
                <button 
                  onClick={fetchCallData}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && callData && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <p className={`text-sm font-semibold ${
                      callData.status === 'ENDED' ? 'text-green-600' :
                      callData.status === 'FAILED' ? 'text-red-600' :
                      callData.status === 'IN_PROGRESS' ? 'text-yellow-600' :
                      'text-blue-600'
                    }`}>
                      {callData.status}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Call ID</label>
                    <p className="text-sm text-gray-900 font-mono">{callData.provider_call_id || 'Not assigned'}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Contact</label>
                    <p className="text-sm text-gray-900">{callData.contact?.name}</p>
                    <p className="text-xs text-gray-500">{callData.contact?.phone}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Cost</label>
                    <p className="text-sm text-gray-900">
                      {callData.cost_usd ? `$${callData.cost_usd.toFixed(4)}` : 'N/A'}
                    </p>
                  </div>
                </div>

                {callData.started_at && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Started</label>
                    <p className="text-sm text-gray-900">
                      {new Date(callData.started_at).toLocaleString()}
                    </p>
                  </div>
                )}

                {callData.ended_at && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Ended</label>
                    <p className="text-sm text-gray-900">
                      {new Date(callData.ended_at).toLocaleString()}
                    </p>
                  </div>
                )}

                {callData.ended_reason && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">End Reason</label>
                    <p className="text-sm text-gray-900">{callData.ended_reason}</p>
                  </div>
                )}

                {callData.transcript_json && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Transcript</label>
                    <div className="bg-gray-50 rounded p-3 text-sm max-h-32 overflow-y-auto">
                      {callData.transcript_json.raw_transcript || 
                       JSON.stringify(callData.transcript_json, null, 2)}
                    </div>
                  </div>
                )}

                {callData.recording_url && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Recording</label>
                    <div className="bg-gray-50 rounded p-3">
                      <audio controls className="w-full">
                        <source src={callData.recording_url} type="audio/mp3" />
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  </div>
                )}

                {/* Raw Data for Debugging */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                    🔧 Debug Data (Click to expand)
                  </summary>
                  <pre className="bg-gray-100 p-2 rounded mt-2 overflow-auto text-xs">
                    {JSON.stringify(callData, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            {!loading && !error && !callData && (
              <div className="text-center py-8 text-gray-500">
                No call data available
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t flex justify-end">
            <button
              onClick={onClose}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}