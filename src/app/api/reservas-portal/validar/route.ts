import { createClient } from '@supabase/supabase-js'
import { enviarSms } from '@/lib/sms'
import { criarEventoReserva } from '@/lib/googleCalendar'
import { CONTACTO_ALL4LASER, podeValidar, formatarData } from '@/lib/reservasPortal'

// Valida (confirma/rejeita) uma reserva do portal e envia SMS à cliente.
// Corre no servidor: verifica que quem chama é staff validador antes de agir.
// Body: { id, acao: 'confirmar' | 'rejeitar', motivo? }

type Reserva = {
  numero: string | null
  estado: string
  cliente_nome: string | null
  cliente_telefone: string | null
  modelo_equipamento: string | null
  modalidade: string | null
  data_inicio_pretendida: string
  data_fim_pretendida: string
}

export async function POST(req: Request) {
  let body: { id?: string; acao?: string; motivo?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, erro: 'JSON inválido' }, { status: 400 })
  }
  const id = String(body.id ?? '')
  const acao = body.acao
  const motivo = (body.motivo ?? '').trim()
  if (!id || (acao !== 'confirmar' && acao !== 'rejeitar')) {
    return Response.json({ ok: false, erro: 'Parâmetros inválidos.' }, { status: 400 })
  }
  if (acao === 'rejeitar' && !motivo) {
    return Response.json({ ok: false, erro: 'O motivo da rejeição é obrigatório.' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado (chaves Supabase).' }, { status: 500 })
  }

  // ── Autenticar o utilizador a partir do token da sessão ──
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: u } = await anon.auth.getUser(jwt)
  if (!u?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // ── Verificar que é staff validador ──
  const { data: perfil } = await admin
    .from('profiles')
    .select('role, email, nome')
    .eq('id', u.user.id)
    .single()
  if (!perfil) return Response.json({ ok: false, erro: 'Apenas staff pode validar.' }, { status: 403 })
  if (!podeValidar(perfil.email as string, perfil.role === 'admin')) {
    return Response.json({ ok: false, erro: 'Sem permissão para validar reservas.' }, { status: 403 })
  }

  // ── Ler a reserva ──
  const { data: r, error: erroR } = await admin
    .from('reservas_portal')
    .select('numero, estado, cliente_nome, cliente_telefone, modelo_equipamento, modalidade, data_inicio_pretendida, data_fim_pretendida')
    .eq('id', id)
    .single()
  if (erroR || !r) return Response.json({ ok: false, erro: 'Reserva não encontrada.' }, { status: 404 })
  const reserva = r as Reserva
  if (reserva.estado !== 'pendente') {
    return Response.json({ ok: false, erro: `A reserva já está ${reserva.estado}.` }, { status: 409 })
  }

  // ── Construir e enviar o SMS ──
  const inicio = formatarData(reserva.data_inicio_pretendida)
  const fim = formatarData(reserva.data_fim_pretendida)
  const corpo = acao === 'confirmar'
    ? `All4laser: A sua reserva ${reserva.numero} foi confirmada! ${reserva.modelo_equipamento ?? ''} de ${inicio} a ${fim}. Contacte-nos: ${CONTACTO_ALL4LASER}`
    : `All4laser: O seu pedido ${reserva.numero} nao pode ser confirmado. ${motivo}. Contacte-nos para alternativas: ${CONTACTO_ALL4LASER}`

  let smsOk = false
  let smsErro: string | undefined
  if (reserva.cliente_telefone) {
    const res = await enviarSms(reserva.cliente_telefone, corpo)
    smsOk = res.ok
    smsErro = res.erro
  } else {
    smsErro = 'A cliente não tem telefone — SMS não enviado.'
  }

  // ── Atualizar a reserva ──
  const update =
    acao === 'confirmar'
      ? { estado: 'confirmada' }
      : { estado: 'rejeitada', motivo_rejeicao: motivo }
  const { error: erroU } = await admin
    .from('reservas_portal')
    .update({
      ...update,
      validado_por: u.user.id,
      validado_por_nome: (perfil.nome as string) ?? null,
      validado_at: new Date().toISOString(),
      sms_confirmacao_enviado: smsOk,
    })
    .eq('id', id)
  if (erroU) return Response.json({ ok: false, erro: erroU.message }, { status: 500 })

  // ── Google Calendar (só ao confirmar; best-effort — não bloqueia a confirmação) ──
  let eventoCriado = false
  let eventoErro: string | undefined
  if (acao === 'confirmar') {
    const ev = await criarEventoReserva({
      numero: reserva.numero,
      modelo: reserva.modelo_equipamento,
      clienteNome: reserva.cliente_nome,
      clienteTelefone: reserva.cliente_telefone,
      modalidade: reserva.modalidade,
      dataInicio: reserva.data_inicio_pretendida,
      dataFim: reserva.data_fim_pretendida,
    })
    eventoCriado = ev.ok
    eventoErro = ev.erro
  }

  return Response.json({ ok: true, smsEnviado: smsOk, smsErro, eventoCriado, eventoErro })
}
