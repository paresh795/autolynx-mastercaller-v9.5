import { NextRequest, NextResponse } from 'next/server'
import { sendMagicLink } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const data = await sendMagicLink(email)
    
    return NextResponse.json({
      message: 'Magic link sent successfully',
      link: data.properties?.action_link // Only in development
    })
  } catch (error: any) {
    console.error('Magic link error:', error)
    
    return NextResponse.json(
      { error: error.message || 'Failed to send magic link' },
      { status: 400 }
    )
  }
}