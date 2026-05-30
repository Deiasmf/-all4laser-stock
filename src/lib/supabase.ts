import { createClient } from '@supabase/supabase-js'

// Configuração pública do Supabase (a chave `anon` é pública por design — a
// segurança é garantida pelas regras RLS na base de dados, não por esconder esta chave).
// Os valores por omissão garantem que a app funciona mesmo sem variáveis de ambiente.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://lykfbclxsyazerffcpta.supabase.co'
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5a2ZiY2x4c3lhemVyZmZjcHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjY4MzQsImV4cCI6MjA5NTY0MjgzNH0.PPgVC8bnCtKJlsLqn2tL7Kq40XM0W1idEjmnV7VOFQE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
