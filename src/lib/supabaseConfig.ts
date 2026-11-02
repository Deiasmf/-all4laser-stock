// Sem defaults: um ambiente de testes nunca deve herdar a produção.
export function validateSupabaseConfig(url: string | undefined, key: string | undefined, deployment: string | undefined) {
  if (!url?.trim() || !key?.trim()) throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY explicitamente.')
  const parsed = new URL(url)
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('URL Supabase inválida.')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) throw new Error('Supabase requer HTTPS.')
  if (deployment !== 'production' && !local && parsed.hostname !== 'wvdmhohijzyymadsfiaz.supabase.co') {
    throw new Error('Fora de produção, apenas a branch de auditoria ou Supabase local são permitidos.')
  }
  if (key.startsWith('sb_secret_')) throw new Error('Chave secreta proibida no cliente público.')
  if (key.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (payload.role !== 'anon') throw new Error('role')
      if (payload.ref && parsed.hostname.endsWith('.supabase.co') && parsed.hostname !== `${payload.ref}.supabase.co`) throw new Error('ref')
    } catch { throw new Error('JWT público inválido ou incompatível com o projeto.') }
  }
  return { url, key }
}
