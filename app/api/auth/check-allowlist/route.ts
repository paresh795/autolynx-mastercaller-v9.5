import { NextRequest, NextResponse } from 'next/server'
import { isUserAllowed } from '@/lib/auth'

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

    const allowed = await isUserAllowed(email)
    
    if (!allowed) {
      return NextResponse.json(
        { error: 'User not authorized' },
        { status: 403 }
      )
    }

    return NextResponse.json({ allowed: true })
  } catch (error: any) {
    console.error('Allowlist check error:', error)
    
    return NextResponse.json(
      { error: 'Failed to check authorization' },
      { status: 500 }
    )
  }
}