import { createClient } from '@supabase/supabase-js'

// Configuração pública do Supabase (a chave `anon` é pública por design — a
// segurança é garantida pelas regras RLS na base de dados, não por esconder esta chave).
// Os valores por omissão garantem que a app funciona mesmo sem variáveis de ambiente.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://lykfbclxsyazerffcpta.supabase.co'
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'sb_publishable_Pdr9GS_jQDwQW5-v9BEoDA__yc5PSBp'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
