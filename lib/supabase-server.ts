// Server-side Supabase client - for API routes only
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing public Supabase environment variables')
}

if (!supabaseServiceKey) {
  throw new Error('Missing Supabase service role key - this should only be used server-side')
}

// Regular client for server-side auth operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client with service role key - SERVER-SIDE ONLY
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export default supabaseAdmin