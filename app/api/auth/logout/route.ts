import { NextRequest, NextResponse } from 'next/server'
import { signOut } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    await signOut()
    
    return NextResponse.json({ message: 'Logged out successfully' })
  } catch (error: any) {
    console.error('Logout error:', error)
    
    return NextResponse.json(
      { error: error.message || 'Logout failed' },
      { status: 500 }
    )
  }
}