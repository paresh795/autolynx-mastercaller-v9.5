'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

interface ValidationResult {
  valid: Array<{
    name: string
    business_name: string
    phone: string
    phone_original: string
  }>
  invalid: Array<{
    row: number
    data: {
      name?: string
      business_name?: string
      phone?: string
    }
    errors: string[]
  }>
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    duplicates: number
  }
}

interface Assistant {
  id: string
  name: string
  active: boolean
}

interface PhoneNumber {
  id: string
  number: string
  provider: string
}

interface CampaignConfig {
  name: string
  assistantId: string
  phoneNumberId: string
  cap: number
  mode: 'continuous' | 'batch'
}

interface ConfigureState {
  loading: boolean
  error: string
  validation: ValidationResult | null
  sessionId: string | null
  showInvalidRows: boolean
  assistants: Assistant[]
  phoneNumbers: PhoneNumber[]
  campaignConfig: CampaignConfig
  creating: boolean
  configErrors: Record<string, string>
}

function ConfigureCampaignContent() {
  const [state, setState] = useState<ConfigureState>({
    loading: true,
    error: '',
    validation: null,
    sessionId: null,
    showInvalidRows: false,
    assistants: [],
    phoneNumbers: [],
    campaignConfig: {
      name: '',
      assistantId: '',
      phoneNumberId: '',
      cap: 8,
      mode: 'continuous'
    },
    creating: false,
    configErrors: {}
  })
  
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const sessionId = searchParams.get('sessionId')
    if (!sessionId) {
      router.push('/campaigns/create')
      return
    }
    
    setState(prev => ({ ...prev, sessionId }))
    fetchValidationData(sessionId)
  }, [searchParams, router])

  const fetchValidationData = async (sessionId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      // Fetch validation data, assistants, and phone numbers in parallel
      const [validationResponse, assistantsResponse, phoneNumbersResponse] = await Promise.all([
        fetch(`/api/campaigns/validation?sessionId=${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch('/api/assistants', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch('/api/phone-numbers', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        })
      ])

      if (validationResponse.status === 401 || assistantsResponse.status === 401) {
        router.push('/login')
        return
      }

      if (validationResponse.status === 404) {
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Session expired or not found. Please upload your CSV file again.' 
        }))
        return
      }

      if (!validationResponse.ok) {
        throw new Error('Failed to load validation data')
      }

      const validationResult = await validationResponse.json()
      const assistantsResult = assistantsResponse.ok ? await assistantsResponse.json() : []
      const phoneNumbersResult = phoneNumbersResponse.ok ? await phoneNumbersResponse.json() : []

      setState(prev => ({ 
        ...prev, 
        loading: false, 
        validation: validationResult.validation,
        assistants: assistantsResult,
        phoneNumbers: phoneNumbersResult,
        campaignConfig: {
          ...prev.campaignConfig,
          assistantId: assistantsResult.length > 0 ? assistantsResult[0].id : '',
          phoneNumberId: phoneNumbersResult.length > 0 ? phoneNumbersResult[0].id : ''
        }
      }))

    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Failed to load validation data' 
      }))
    }
  }

  const validateCampaignConfig = (): boolean => {
    const errors: Record<string, string> = {}
    
    if (!state.campaignConfig.name.trim()) {
      errors.name = 'Campaign name is required'
    } else if (state.campaignConfig.name.length > 100) {
      errors.name = 'Campaign name must be less than 100 characters'
    }
    
    if (!state.campaignConfig.assistantId) {
      errors.assistantId = 'Please select an assistant'
    }
    
    if (!state.campaignConfig.phoneNumberId) {
      errors.phoneNumberId = 'Please select a phone number'
    }
    
    if (state.campaignConfig.cap < 1 || state.campaignConfig.cap > 50) {
      errors.cap = 'Concurrency cap must be between 1 and 50'
    }
    
    setState(prev => ({ ...prev, configErrors: errors }))
    return Object.keys(errors).length === 0
  }

  const handleCreateCampaign = async () => {
    if (!validateCampaignConfig()) {
      return
    }

    setState(prev => ({ ...prev, creating: true, error: '' }))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...state.campaignConfig,
          sessionId: state.sessionId
        })
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create campaign')
      }

      const result = await response.json()
      
      // Redirect to campaign details page
      router.push(`/campaigns/${result.campaignId}`)
      
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        creating: false, 
        error: error instanceof Error ? error.message : 'Failed to create campaign' 
      }))
    }
  }

  const updateCampaignConfig = (field: keyof CampaignConfig, value: any) => {
    setState(prev => ({
      ...prev,
      campaignConfig: {
        ...prev.campaignConfig,
        [field]: value
      },
      configErrors: {
        ...prev.configErrors,
        [field]: '' // Clear error when user starts typing
      }
    }))
  }

  const handleBackToUpload = () => {
    router.push('/campaigns/create')
  }

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading validation results...</p>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <h1 className="text-3xl font-bold text-gray-900">Campaign Configuration</h1>
              <button
                onClick={handleBackToUpload}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                ← Back to Upload
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {state.error}
          </div>
        </main>
      </div>
    )
  }

  const { validation } = state

  if (!validation) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <h1 className="text-3xl font-bold text-gray-900">Campaign Configuration</h1>
              <button
                onClick={handleBackToUpload}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                ← Back to Upload
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded">
            No validation data found. Please upload a CSV file first.
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Review & Configure Campaign</h1>
              <p className="text-gray-600">Review your contact validation results</p>
            </div>
            <button
              onClick={handleBackToUpload}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              ← Back to Upload
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Validation Summary */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Validation Summary</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{validation.summary.totalRows}</div>
                <div className="text-sm text-gray-600">Total Rows</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{validation.summary.validRows}</div>
                <div className="text-sm text-gray-600">Valid Contacts</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{validation.summary.invalidRows}</div>
                <div className="text-sm text-gray-600">Invalid Rows</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{validation.summary.duplicates}</div>
                <div className="text-sm text-gray-600">Duplicates</div>
              </div>
            </div>

            {validation.summary.validRows > 0 && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">
                      Ready to proceed
                    </h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>{validation.summary.validRows} contacts are ready for your campaign.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Invalid Rows Section */}
        {validation.summary.invalidRows > 0 && (
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">
                  Issues Found ({validation.summary.invalidRows} rows)
                </h2>
                <button
                  onClick={() => setState(prev => ({ ...prev, showInvalidRows: !prev.showInvalidRows }))}
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  {state.showInvalidRows ? 'Hide Details' : 'Show Details'}
                </button>
              </div>
            </div>
            
            {state.showInvalidRows && (
              <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-700">
                    The following rows have issues that need to be fixed. You can either:
                  </p>
                  <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                    <li>Fix the issues in your CSV file and re-upload</li>
                    <li>Continue with only the valid contacts</li>
                  </ul>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Row
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Business
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Issues
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {validation.invalid.map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.row}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.data.name || '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.data.business_name || '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.data.phone || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-red-600">
                            <ul className="list-disc list-inside">
                              {row.errors.map((error, errorIndex) => (
                                <li key={errorIndex}>{error}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Valid Contacts Preview */}
        {validation.summary.validRows > 0 && (
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Valid Contacts Preview ({validation.summary.validRows} total)
              </h2>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Business
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Phone (Normalized)
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Original Phone
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {validation.valid.slice(0, 5).map((contact, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {contact.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {contact.business_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {contact.phone}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {contact.phone_original}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validation.valid.length > 5 && (
                  <div className="mt-4 text-center text-sm text-gray-500">
                    Showing first 5 contacts. {validation.valid.length - 5} more contacts will be imported.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Campaign Configuration Form */}
        {validation && validation.summary.validRows > 0 && (
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Campaign Configuration</h2>
              <p className="text-gray-600">Configure your campaign settings</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Campaign Name */}
                <div className="md:col-span-2">
                  <label htmlFor="campaignName" className="block text-sm font-medium text-gray-700 mb-2">
                    Campaign Name *
                  </label>
                  <input
                    type="text"
                    id="campaignName"
                    value={state.campaignConfig.name}
                    onChange={(e) => updateCampaignConfig('name', e.target.value)}
                    placeholder="Enter campaign name"
                    className={`w-full px-3 py-2 border rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500 ${
                      state.configErrors.name ? 'border-red-300' : 'border-gray-300'
                    }`}
                    maxLength={100}
                  />
                  {state.configErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{state.configErrors.name}</p>
                  )}
                </div>

                {/* Assistant Selection */}
                <div>
                  <label htmlFor="assistantId" className="block text-sm font-medium text-gray-700 mb-2">
                    Assistant *
                  </label>
                  <select
                    id="assistantId"
                    value={state.campaignConfig.assistantId}
                    onChange={(e) => updateCampaignConfig('assistantId', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500 ${
                      state.configErrors.assistantId ? 'border-red-300' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select an assistant</option>
                    {state.assistants.filter(a => a.active).map(assistant => (
                      <option key={assistant.id} value={assistant.id}>
                        {assistant.name}
                      </option>
                    ))}
                  </select>
                  {state.configErrors.assistantId && (
                    <p className="mt-1 text-sm text-red-600">{state.configErrors.assistantId}</p>
                  )}
                  {state.assistants.length === 0 && (
                    <p className="mt-1 text-sm text-gray-500">No assistants available. Create an assistant first.</p>
                  )}
                </div>

                {/* Phone Number Selection */}
                <div>
                  <label htmlFor="phoneNumberId" className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <select
                    id="phoneNumberId"
                    value={state.campaignConfig.phoneNumberId}
                    onChange={(e) => updateCampaignConfig('phoneNumberId', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500 ${
                      state.configErrors.phoneNumberId ? 'border-red-300' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select a phone number</option>
                    {state.phoneNumbers.map(phone => (
                      <option key={phone.id} value={phone.id}>
                        {phone.number} ({phone.provider})
                      </option>
                    ))}
                  </select>
                  {state.configErrors.phoneNumberId && (
                    <p className="mt-1 text-sm text-red-600">{state.configErrors.phoneNumberId}</p>
                  )}
                </div>

                {/* Concurrency Cap */}
                <div>
                  <label htmlFor="cap" className="block text-sm font-medium text-gray-700 mb-2">
                    Concurrency Cap *
                  </label>
                  <input
                    type="number"
                    id="cap"
                    min="1"
                    max="50"
                    value={state.campaignConfig.cap}
                    onChange={(e) => updateCampaignConfig('cap', parseInt(e.target.value) || 1)}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500 ${
                      state.configErrors.cap ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                  <p className="mt-1 text-sm text-gray-500">Maximum simultaneous calls (1-50)</p>
                  {state.configErrors.cap && (
                    <p className="mt-1 text-sm text-red-600">{state.configErrors.cap}</p>
                  )}
                </div>

                {/* Mode Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Campaign Mode *
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        id="continuous"
                        type="radio"
                        name="mode"
                        value="continuous"
                        checked={state.campaignConfig.mode === 'continuous'}
                        onChange={(e) => updateCampaignConfig('mode', e.target.value)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <label htmlFor="continuous" className="ml-3 block text-sm text-gray-700">
                        <span className="font-medium">Continuous</span>
                        <span className="block text-gray-500">Calls made continuously until all contacts are reached</span>
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        id="batch"
                        type="radio"
                        name="mode"
                        value="batch"
                        checked={state.campaignConfig.mode === 'batch'}
                        onChange={(e) => updateCampaignConfig('mode', e.target.value)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <label htmlFor="batch" className="ml-3 block text-sm text-gray-700">
                        <span className="font-medium">Batch</span>
                        <span className="block text-gray-500">Manual control over when calls are made</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Campaign Summary */}
              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Campaign Summary</h3>
                <div className="text-sm text-blue-800">
                  <p>• {validation.summary.validRows} contacts will be imported</p>
                  <p>• Maximum {state.campaignConfig.cap} simultaneous calls</p>
                  <p>• Mode: {state.campaignConfig.mode === 'continuous' ? 'Continuous calling' : 'Batch calling'}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between">
          <button
            onClick={handleBackToUpload}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-md font-medium"
          >
            ← Upload Different File
          </button>
          
          {validation.summary.validRows > 0 && (
            <button
              onClick={handleCreateCampaign}
              disabled={state.creating}
              className={`px-6 py-3 rounded-md font-medium ${
                state.creating
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {state.creating ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Campaign...
                </span>
              ) : (
                `Create Campaign with ${validation.summary.validRows} Contacts`
              )}
            </button>
          )}
        </div>

        {validation.summary.validRows === 0 && (
          <div className="text-center">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-red-800 mb-2">No Valid Contacts Found</h3>
              <p className="text-red-700">
                Please fix the issues in your CSV file and upload again.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function ConfigureCampaignPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <ConfigureCampaignContent />
    </Suspense>
  )
}