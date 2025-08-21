'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

interface UploadState {
  file: File | null
  uploading: boolean
  error: string
  success: boolean
  dragActive: boolean
}

export default function CreateCampaignPage() {
  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    uploading: false,
    error: '',
    success: false,
    dragActive: false
  })
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // File validation
  const validateFile = (file: File): string | null => {
    // Check file type
    if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
      return 'Please upload a CSV file (.csv extension)'
    }
    
    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return 'File size must be less than 10MB'
    }
    
    // Check if file is empty
    if (file.size === 0) {
      return 'File is empty. Please upload a valid CSV file'
    }
    
    return null
  }

  const handleFileSelect = (file: File) => {
    const error = validateFile(file)
    if (error) {
      setUploadState(prev => ({ ...prev, error, file: null }))
      return
    }
    
    setUploadState(prev => ({ 
      ...prev, 
      file, 
      error: '', 
      success: false 
    }))
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setUploadState(prev => ({ ...prev, dragActive: false }))
    
    const file = event.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    setUploadState(prev => ({ ...prev, dragActive: true }))
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    setUploadState(prev => ({ ...prev, dragActive: false }))
  }

  const removeFile = () => {
    setUploadState(prev => ({ 
      ...prev, 
      file: null, 
      error: '', 
      success: false 
    }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (!uploadState.file) {
      setUploadState(prev => ({ ...prev, error: 'Please select a file first' }))
      return
    }

    setUploadState(prev => ({ ...prev, uploading: true, error: '' }))

    try {
      // Get current session for authentication
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      // Create FormData for file upload
      const formData = new FormData()
      formData.append('csv', uploadState.file)

      // Upload to API
      const response = await fetch('/api/campaigns/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      setUploadState(prev => ({ 
        ...prev, 
        uploading: false, 
        success: true 
      }))

      // Redirect to campaign configuration with upload session ID
      router.push(`/campaigns/configure?sessionId=${result.sessionId}`)
      
    } catch (error) {
      setUploadState(prev => ({ 
        ...prev, 
        uploading: false, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      }))
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create New Campaign</h1>
              <p className="text-gray-600">Upload your contact list and configure your campaign</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-8">
            {/* Step 1: File Upload */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Step 1: Upload Contact List
              </h2>
              
              {/* Upload Area */}
              <div
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  uploadState.dragActive
                    ? 'border-blue-400 bg-blue-50'
                    : uploadState.file
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                {!uploadState.file ? (
                  <div>
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="mt-4">
                      <p className="text-lg text-gray-600">
                        Drop your CSV file here, or{' '}
                        <span className="text-blue-600 font-medium">browse</span>
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        Maximum file size: 10MB
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <svg
                      className="mx-auto h-12 w-12 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="mt-4">
                      <p className="text-lg font-medium text-gray-900">
                        {uploadState.file.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(uploadState.file.size)}
                      </p>
                      <button
                        onClick={removeFile}
                        className="mt-2 text-sm text-red-600 hover:text-red-500"
                      >
                        Remove file
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {uploadState.error && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {uploadState.error}
                </div>
              )}

              {/* Success Message */}
              {uploadState.success && (
                <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                  File uploaded successfully! Redirecting to campaign configuration...
                </div>
              )}
            </div>

            {/* Requirements */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-blue-900 mb-2">
                CSV File Requirements:
              </h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Required columns: <code>name</code>, <code>business_name</code>, <code>phone</code></li>
                <li>• Headers are case-insensitive</li>
                <li>• Phone numbers will be automatically formatted</li>
                <li>• Duplicate phone numbers will be removed</li>
                <li>• Maximum file size: 10MB (~100,000 contacts)</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between">
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-md font-medium"
              >
                Cancel
              </button>
              
              <button
                onClick={handleUpload}
                disabled={!uploadState.file || uploadState.uploading}
                className={`px-6 py-2 rounded-md font-medium ${
                  uploadState.file && !uploadState.uploading
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {uploadState.uploading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </span>
                ) : (
                  'Continue to Configuration →'
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}