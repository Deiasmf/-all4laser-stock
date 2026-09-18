import { createClient } from '@supabase/supabase-js'
import { validarCalendarios } from '@/lib/googleCalendar'

// Validação de acesso aos 18 calendários da frota (Fase A — diagnóstico).
// Só-leitura. Só staff (verifica o token da sessão). Reporta quais falham para
// se corrigir a partilha no Google. A lista fica aqui como seed provisório até
// existir a tabela de mapeamento gerível.

export const runtime = 'nodejs'

const CALENDARIOS: { id: string; nome: string; zona: string }[] = [
  // Lisboa (Nuno; reforço Artur/Rafael)
  { zona: 'Lisboa', nome: 'Alex A', id: 'all4laser.com_t5fharmhm7rqfllte42te6v9is@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Alex B - Gpro', id: 'all4laser.com_k7cjifhrancibi3mek6ddm3v30@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Alex C - Gpro', id: 'all4laser.com_3e0gpevq04r6vnna9fv17khd84@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Alex D - Gpro', id: 'all4laser.com_oebsgn2hsv6quh2jgpj7u10kfc@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Alex E Gpro', id: 'all4laser.com_9659pn6sskpar7f3msk1apn89s@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Alex F Gpro', id: '5bqn23kv4obkpr2gb13lnrkoqo@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Alex G Gpro', id: 'c_q40ekodqd846j67favbdrqpi4g@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Alex H Gpro', id: 'c_jhhuc32tdgafltdcgq232qrc5c@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Alex I GentleMax Pro', id: 'all4laser.com_798vj166ci136vlad0510i12o8@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Soprano ICE', id: 'c_q0rfjojfvot5rd0ucf8q3s3s10@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Soprano Platinum', id: 'c_fbefdaac7e695feec5d4a4c3f49d7c6de31af4b04588a65a1ed558fd9db263d3@group.calendar.google.com' },
  { zona: 'Lisboa', nome: 'Laser Diodo ALMA', id: '4lkg67nkaelf90sljtpdu4941g@group.calendar.google.com' },
  // Algarve (parceiro externo Gonçalo)
  { zona: 'Algarve', nome: 'Alex J Gmax Pro Algarve', id: 'c_604fac79664df0563c312a18b25e83c0c050f858b3e21da94a1788b57aa62ff5@group.calendar.google.com' },
  // Norte (José)
  { zona: 'Norte', nome: 'Alex K - Gpro Norte 1', id: 'c_d6bua321f1qn1hk6kdj5dgb6cc@group.calendar.google.com' },
  { zona: 'Norte', nome: 'Alex L - Gpro Norte 2', id: 'c_vri26c3skollem09mses2fani8@group.calendar.google.com' },
  { zona: 'Norte', nome: 'Alex M - Gmax Pro Norte', id: 'smvj02908gh5ria1qkau3dnkjo@group.calendar.google.com' },
  { zona: 'Norte', nome: 'Alex N - Gmax Pro Norte 2', id: 'c_8e6c8dcba39f74d5b2b5b6410ac621d4c52a5f55d4a17eddad618d3ff79f1bd0@group.calendar.google.com' },
  { zona: 'Norte', nome: 'Alex O - Gpro Norte 3', id: 'c_a7b9f1180a2f0720ef29d542d56320fe125caab90b05e3a92cea831eddb095c6@group.calendar.google.com' },
]

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: u } = await anon.auth.getUser(jwt)
  if (!u?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await admin.from('profiles').select('id').eq('id', u.user.id).single()
  if (!perfil) return Response.json({ ok: false, erro: 'Apenas staff.' }, { status: 403 })

  const res = await validarCalendarios(CALENDARIOS)
  if (!res.ok) return Response.json({ ok: false, erro: res.erro }, { status: 502 })
  const resultados = res.resultados ?? []
  return Response.json({
    ok: true,
    total: resultados.length,
    acessiveis: resultados.filter((r) => r.ok).length,
    inacessiveis: resultados.filter((r) => !r.ok),
    resultados,
  })
}
