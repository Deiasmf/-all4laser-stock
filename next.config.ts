import type { NextConfig } from 'next'
import { validateSupabaseConfig } from './src/lib/supabaseConfig'

// VERCEL_ENV é fornecido pela plataforma; NODE_ENV=production também é usado
// nos builds de preview e não identifica o destino de publicação.
const deployment = process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV
validateSupabaseConfig(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, deployment)

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_VERCEL_ENV: deployment ?? 'development' },
}
export default nextConfig
