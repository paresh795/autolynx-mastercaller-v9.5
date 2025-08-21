import { NextRequest } from 'next/server'
import { supabase } from './supabase-client'
import { supabaseAdmin } from './supabase-server'

export interface User {
  id: string
  email: string
  role: 'admin' | 'operator'
}

// Get current user from request
export async function getCurrentUser(request: NextRequest): Promise<User | null> {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    
    if (!token) {
      console.log('No authorization token found')
      return null
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    
    if (error || !user) {
      console.log('Token validation failed:', error?.message)
      return null
    }

    // Check if user is in allowlist
    const isAllowed = await isUserAllowed(user.email!)
    if (!isAllowed) {
      console.log('User not in allowlist:', user.email)
      return null
    }

    return {
      id: user.id,
      email: user.email!,
      role: user.user_metadata?.role || 'operator'
    }
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

// Check if user email is in allowlist
export async function isUserAllowed(email: string): Promise<boolean> {
  try {
    // For now, we'll use a simple environment variable approach
    // Later we can move this to a database table
    const allowedEmails = process.env.ALLOWED_EMAILS?.split(',') || []
    
    return allowedEmails.includes(email.toLowerCase())
  } catch (error) {
    console.error('Error checking user allowlist:', error)
    return false
  }
}

// Create session for client-side auth
export async function createClientSession(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  
  if (error) throw error
  
  // Verify user is allowed
  const allowed = await isUserAllowed(email)
  if (!allowed) {
    await supabase.auth.signOut()
    throw new Error('User not authorized to access this application')
  }
  
  return data
}

// Sign out user
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Middleware to protect API routes
export function withAuth<T extends any[]>(
  handler: (request: NextRequest, context: any, user: User) => Promise<Response>
) {
  return async (request: NextRequest, context?: any) => {
    const user = await getCurrentUser(request)
    
    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }
    
    return handler(request, context, user)
  }
}

// Role-based access control
export function requireRole(role: 'admin' | 'operator') {
  return function(handler: (request: NextRequest, user: User) => Promise<Response>) {
    return withAuth(async (request: NextRequest, user: User) => {
      if (user.role !== role && user.role !== 'admin') {
        return new Response('Forbidden', { status: 403 })
      }
      
      return handler(request, user)
    })
  }
}

// Generate a magic link for user (alternative to password)
export async function sendMagicLink(email: string) {
  // First check if user is allowed
  const allowed = await isUserAllowed(email)
  if (!allowed) {
    throw new Error('User not authorized to access this application')
  }
  
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
    }
  })
  
  if (error) throw error
  return data
}