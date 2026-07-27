import { supabase } from './supabase'

// Histórico de uma unidade por Serial Number, cruzando os três sítios onde um
// S/N pode aparecer: envios de peças (saídas), receções (entradas) e o histórico
// legado de reparações. Serve a página de pesquisa de S/N.

export type FonteSerial = 'envio' | 'recepcao' | 'reparacao'
export type EntidadeTipo = 'cliente' | 'fornecedor'

export type SerialEvento = {
  fonte: FonteSerial
  data: string | null
  entidade: string | null
  entidade_tipo: EntidadeTipo | null
  peca: string | null
  referencia: string | null
  estado: string | null
  detalhe: string | null
}

// Sugestões de S/N que contêm o termo (para o autocompletar). Distinto, limitado.
export async function pesquisarSeriais(termo: string): Promise<string[]> {
  const t = termo.trim()
  if (t.length < 2) return []
  const like = `%${t}%`
  const [env, rec, rep] = await Promise.all([
    supabase.from('envios_pecas_itens').select('serial_number').ilike('serial_number', like).limit(20),
    supabase.from('rececoes_pecas_itens').select('serial_number').ilike('serial_number', like).limit(20),
    supabase.from('reparacao_pecas').select('serial_number').ilike('serial_number', like).limit(20),
  ])
  const set = new Set<string>()
  for (const r of [env, rec, rep]) {
    for (const row of (r.data as { serial_number: string | null }[] | null) ?? []) {
      if (row.serial_number) set.add(row.serial_number)
    }
  }
  return Array.from(set).sort().slice(0, 15)
}

type EnvioEmbed = {
  serial_number: string | null; peca_nome: string | null
  envios_pecas: { numero: string | null; destinatario_tipo: EntidadeTipo | null; cliente_nome: string | null; fornecedor_nome: string | null; estado: string | null; motivo: string | null; expedido_em: string | null; created_at: string } | null
}
type RececaoEmbed = {
  serial_number: string | null; peca_nome: string | null
  rececoes_pecas: { numero: string | null; origem_tipo: EntidadeTipo | null; cliente_nome: string | null; fornecedor_nome: string | null; estado: string | null; motivo: string | null; recebido_em: string | null; created_at: string } | null
}
type ReparacaoRow = {
  numero: string | null; peca: string | null; fornecedor: string | null; status: string | null
  data_saida: string | null; data_entrada: string | null
}

// Histórico completo de um S/N (correspondência exata, ignorando maiúsculas).
export async function historicoSerial(sn: string): Promise<SerialEvento[]> {
  const s = sn.trim()
  if (!s) return []
  const eventos: SerialEvento[] = []

  const [env, rec, rep] = await Promise.all([
    supabase.from('envios_pecas_itens')
      .select('serial_number, peca_nome, envios_pecas!inner(numero, destinatario_tipo, cliente_nome, fornecedor_nome, estado, motivo, expedido_em, created_at)')
      .ilike('serial_number', s),
    supabase.from('rececoes_pecas_itens')
      .select('serial_number, peca_nome, rececoes_pecas!inner(numero, origem_tipo, cliente_nome, fornecedor_nome, estado, motivo, recebido_em, created_at)')
      .ilike('serial_number', s),
    supabase.from('reparacao_pecas')
      .select('numero, peca, fornecedor, status, data_saida, data_entrada')
      .ilike('serial_number', s),
  ])

  for (const it of (env.data as unknown as EnvioEmbed[] | null) ?? []) {
    const e = it.envios_pecas
    if (!e) continue
    eventos.push({
      fonte: 'envio',
      data: e.expedido_em ?? e.created_at,
      entidade: e.destinatario_tipo === 'cliente' ? e.cliente_nome : e.fornecedor_nome,
      entidade_tipo: e.destinatario_tipo,
      peca: it.peca_nome,
      referencia: e.numero,
      estado: e.estado,
      detalhe: e.motivo ? `Motivo: ${e.motivo}` : null,
    })
  }
  for (const it of (rec.data as unknown as RececaoEmbed[] | null) ?? []) {
    const r = it.rececoes_pecas
    if (!r) continue
    eventos.push({
      fonte: 'recepcao',
      data: r.recebido_em ?? r.created_at,
      entidade: r.origem_tipo === 'cliente' ? r.cliente_nome : r.fornecedor_nome,
      entidade_tipo: r.origem_tipo,
      peca: it.peca_nome,
      referencia: r.numero,
      estado: r.estado,
      detalhe: r.motivo ? `Motivo: ${r.motivo}` : null,
    })
  }
  for (const r of (rep.data as ReparacaoRow[] | null) ?? []) {
    eventos.push({
      fonte: 'reparacao',
      data: r.data_saida ?? r.data_entrada,
      entidade: r.fornecedor,
      entidade_tipo: 'fornecedor',
      peca: r.peca,
      referencia: r.numero,
      estado: r.status,
      detalhe: r.data_entrada ? `Voltou em ${r.data_entrada}` : 'Ainda em reparação',
    })
  }

  eventos.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
  return eventos
}

// S/N enviados para uma entidade que ainda não foram rececionados de volta
// (sugestões ao rececionar). entidadeId opcional; se ausente usa o nome.
export async function seriaisEmAberto(entidadeTipo: EntidadeTipo, entidadeId: string | null, entidadeNome: string | null): Promise<{ serial_number: string; peca_nome: string | null; envio: string | null }[]> {
  // Envios de reparação expedidos para a entidade, com S/N.
  let q = supabase.from('envios_pecas_itens')
    .select('serial_number, peca_nome, envios_pecas!inner(numero, estado, motivo, destinatario_tipo, cliente_id, fornecedor_id, cliente_nome, fornecedor_nome)')
    .not('serial_number', 'is', null)
    .eq('envios_pecas.estado', 'expedido')
    .eq('envios_pecas.destinatario_tipo', entidadeTipo)
  if (entidadeId) {
    q = q.eq(entidadeTipo === 'cliente' ? 'envios_pecas.cliente_id' : 'envios_pecas.fornecedor_id', entidadeId)
  } else if (entidadeNome) {
    q = q.eq(entidadeTipo === 'cliente' ? 'envios_pecas.cliente_nome' : 'envios_pecas.fornecedor_nome', entidadeNome)
  }
  const { data } = await q
  const enviados = (data as unknown as { serial_number: string; peca_nome: string | null; envios_pecas: { numero: string | null } | null }[] | null) ?? []
  if (enviados.length === 0) return []

  // Excluir os que já voltaram (aparecem numa receção conferida).
  const sns = enviados.map((e) => e.serial_number)
  const { data: rec } = await supabase.from('rececoes_pecas_itens')
    .select('serial_number, rececoes_pecas!inner(estado)')
    .in('serial_number', sns)
    .eq('rececoes_pecas.estado', 'conferido')
  const recebidos = new Set(((rec as unknown as { serial_number: string }[] | null) ?? []).map((r) => r.serial_number))

  return enviados
    .filter((e) => !recebidos.has(e.serial_number))
    .map((e) => ({ serial_number: e.serial_number, peca_nome: e.peca_nome, envio: e.envios_pecas?.numero ?? null }))
}
