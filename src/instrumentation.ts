import { validateSupabaseConfig } from './lib/supabaseConfig'

// Valida também no arranque: rotas que criam clientes próprios não devem
// aceitar variáveis de runtime diferentes do destino autorizado do build.
export function register() {
  validateSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV,
  )
}
