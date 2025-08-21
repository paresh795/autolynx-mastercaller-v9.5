import { NextRequest, NextResponse } from 'next/server'
import { createClientSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const data = await createClientSession(email, password)
    
    return NextResponse.json({
      user: data.user,
      session: data.session
    })
  } catch (error: any) {
    console.error('Login error:', error)
    
    return NextResponse.json(
      { error: error.message || 'Login failed' },
      { status: 401 }
    )
  }
}