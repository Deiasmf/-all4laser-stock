import { createClient } from '@supabase/supabase-js'
import { validateSupabaseConfig } from './supabaseConfig'

const config = validateSupabaseConfig(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  process.env.NEXT_PUBLIC_VERCEL_ENV,
)
export const supabase = createClient(config.url, config.key)
