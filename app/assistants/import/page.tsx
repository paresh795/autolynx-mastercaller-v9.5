'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

export default function ImportAssistantPage() {
  const router = useRouter()
  const [assistantId, setAssistantId] = useState('')
  const [name, setName] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setImporting(true)
    setError('')
    setSuccess('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      const response = await fetch('/api/assistants/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          providerAssistantId: assistantId.trim(),
          name: name.trim() || undefined
        })
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }

      const result = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          setError('This assistant is already imported')
        } else if (response.status === 404) {
          setError('Assistant not found in Vapi. Please check the ID and try again.')
        } else {
          throw new Error(result.error || 'Failed to import assistant')
        }
        return
      }

      setSuccess(`Assistant "${result.name}" imported successfully!`)
      setTimeout(() => {
        router.push('/assistants')
      }, 2000)
    } catch (err: any) {
      console.error('Error importing assistant:', err)
      setError(err.message || 'Failed to import assistant')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Import Assistant</h1>
              <p className="mt-2 text-gray-600">Import an existing assistant from Vapi</p>
            </div>
            <button
              onClick={() => router.push('/assistants')}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to Assistants
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6">
          <div className="mb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-2">Import Existing Assistant</h2>
            <p className="text-sm text-gray-600">
              Enter the Vapi assistant ID to import an assistant you've already created in your Vapi dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vapi Assistant ID *
              </label>
              <input
                type="text"
                value={assistantId}
                onChange={(e) => setAssistantId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 550e96c2-103c-4ec7-bd00-61d188b5b4b5"
              />
              <p className="mt-1 text-sm text-gray-500">
                You can find this in your Vapi dashboard under the assistant details.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display Name (optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Custom name for this assistant (optional)"
              />
              <p className="mt-1 text-sm text-gray-500">
                Leave blank to use the assistant's original name from Vapi.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    How to find your Vapi Assistant ID:
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to your Vapi dashboard</li>
                      <li>Navigate to the Assistants section</li>
                      <li>Click on the assistant you want to import</li>
                      <li>Copy the Assistant ID from the details page</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => router.push('/assistants')}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={importing}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={importing || !assistantId.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import Assistant'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}