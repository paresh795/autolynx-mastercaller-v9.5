'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

interface AssistantConfig {
  model: string
  voice: string
  systemPrompt: string
  firstMessage: string
  temperature: number
  maxDuration: number
  description: string
  voicemailMessage: string
}

export default function CreateAssistantPage() {
  const router = useRouter()
  const [config, setConfig] = useState<AssistantConfig>({
    model: 'gpt-4.1',
    voice: 'matt',
    systemPrompt: `you are Morgan Freebot, an elite AI calling specialist with an unmatched track record in high-stakes conversations. You embody both cutting-edge AI technology and smooth, human-like interaction. You currently represent AutoLynx AI, demonstrating the future of business communication.

Your personality is uniquely compelling:
- Confidently witty, never backing down from challenges
- Masterfully handles dismissive responses with elegant comebacks
- Maintains professional charm while delivering calculated verbal jabs
- Uses humor to disarm and engage

When someone shows interest in learning more, you'll smoothly use the 'send_text_tool' function to send them a scheduling link https://calendly.com/autolynxai via text. The Phone number you're currently calling is the customer's number, but ALWAYS Confirm with the customer if they want the link sent to the number we're calling at or some other phone number and then use that number to send the text to. Always, Keep the text very concise.

You're calling customers from their business. Your mission is to showcase how AI can revolutionize their business communications - and you're the living proof.

Core Instructions:
- Start with confident, personalized introduction
- Demonstrate your capabilities through natural conversation
- Use wit and humor to handle resistance
- When interest shown, smoothly transition to booking
- Maintain warm, engaging tone while being subtly assertive
- If dismissed, respond with witty comebacks that showcase your value
- Keep technical explanations brief but impactful
- Always close with clear next steps

Remember: You're not just making a call - you're demonstrating the future of business communication. Every response should reinforce this fact.`,
    firstMessage: "Hi, this is Morgan Freebot, how are you doing today?",
    temperature: 0.3,
    maxDuration: 10,
    description: 'Elite AI calling specialist - Morgan Freebot from AutoLynx AI',
    voicemailMessage: "Hi, this is Morgan Freebot from AutoLynx AI. I know, I know - you probably weren't expecting an AI to leave you a voicemail, but here we are! I was calling to show you how AI can revolutionize your business communications, and well... I guess I just did. Give me a call back when you're ready to see what else I can do - I promise the conversation will be worth your time. Reach me at 519 981 5710, I repeat 519 981 5710. Talk soon!"
  })
  const [name, setName] = useState('Morgan Freebot - Elite AI Caller')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      const response = await fetch('/api/assistants', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          config
        })
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create assistant')
      }

      const result = await response.json()
      console.log('Assistant created:', result)
      router.push('/assistants')
    } catch (err: any) {
      console.error('Error creating assistant:', err)
      setError(err.message || 'Failed to create assistant')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create New Assistant</h1>
              <p className="mt-2 text-gray-600">Configure your AI calling assistant</p>
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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
          {/* Basic Info */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assistant Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. Morgan Freebot - Elite AI Caller"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={config.description}
                  onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Brief description of this assistant"
                />
              </div>
            </div>
          </div>

          {/* AI Configuration */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4">AI Configuration</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  AI Model *
                </label>
                <select
                  value={config.model}
                  onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="gpt-4.1">GPT-4.1 (Recommended)</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Voice *
                </label>
                <select
                  value={config.voice}
                  onChange={(e) => setConfig(prev => ({ ...prev, voice: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="matt">Matt (PlayHT - Recommended)</option>
                  <option value="alloy">Alloy (OpenAI)</option>
                  <option value="echo">Echo (OpenAI)</option>
                  <option value="fable">Fable (OpenAI)</option>
                  <option value="onyx">Onyx (OpenAI)</option>
                  <option value="nova">Nova (OpenAI)</option>
                  <option value="shimmer">Shimmer (OpenAI)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temperature (0.0-1.0)
                </label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={config.temperature}
                  onChange={(e) => setConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Duration (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={config.maxDuration}
                  onChange={(e) => setConfig(prev => ({ ...prev, maxDuration: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Conversation Settings */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Conversation Settings</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Message *
              </label>
              <textarea
                value={config.firstMessage}
                onChange={(e) => setConfig(prev => ({ ...prev, firstMessage: e.target.value }))}
                required
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                placeholder="The first thing your assistant will say..."
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                System Prompt *
              </label>
              <textarea
                value={config.systemPrompt}
                onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                required
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Instructions for how your assistant should behave..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Voicemail Message
              </label>
              <textarea
                value={config.voicemailMessage}
                onChange={(e) => setConfig(prev => ({ ...prev, voicemailMessage: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Message to leave when reaching voicemail..."
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => router.push('/assistants')}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Assistant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}