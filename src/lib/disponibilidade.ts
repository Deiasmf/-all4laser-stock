import { supabase } from './supabase'
import { ESTADOS_OCUPAM, ZIMMER_PACK, type ModeloAluguer } from '@/types/reserva'
import { grupoPreco } from './alugueres'
import type { MarcacaoOcupada } from './agendaOcupacao'

// Lista os modelos do catálogo (com frota) — só os alugáveis por omissão.
export async function listarModelos(apenasAlugaveis = true): Promise<ModeloAluguer[]> {
  let q = supabase.from('v_frota_modelos').select('*').order('ordem')
  if (apenasAlugaveis) q = q.eq('alugavel', true)
  const { data } = await q
  return (data as ModeloAluguer[]) ?? []
}

export async function frotaZimmer(): Promise<number> {
  const { data } = await supabase
    .from('v_frota_modelos')
    .select('frota')
    .eq('nome', ZIMMER_PACK)
    .maybeSingle()
  return (data as { frota: number } | null)?.frota ?? 0
}

export type ResultadoDisponibilidade = {
  modelo: ModeloAluguer
  frotaLaser: number
  laserOcupadas: number
  reservasOcupadas: number
  agendaOcupadas: number
  agendaMarcacoes: MarcacaoOcupada[]
  agendaAviso: string | null
  agendaFalhou: boolean
  laserDisponiveis: number
  requerZimmer: boolean
  frotaZimmer: number
  zimmerOcupados: number
  zimmerDisponiveis: number
  disponivel: boolean
}

type RespostaAgenda = {
  ok: boolean
  erro?: string
  semCalendarios?: boolean
  porGrupo?: Record<string, number>
  marcacoes?: MarcacaoOcupada[]
  erros?: string[]
}

// Ocupação segundo as marcações nas agendas Google mapeadas (Alugueres → Agenda).
// A leitura é feita no servidor (Service Account), por isso passa pela rota.
async function ocupacaoAgendas(inicio: string, fim: string): Promise<RespostaAgenda> {
  try {
    const { data: s } = await supabase.auth.getSession()
    const token = s.session?.access_token
    const r = await fetch(
      `/api/alugueres/disponibilidade/agenda?inicio=${inicio}&fim=${fim}`,
      { headers: { Authorization: `Bearer ${token ?? ''}` } },
    )
    return (await r.json()) as RespostaAgenda
  } catch {
    return { ok: false, erro: 'Não foi possível contactar as agendas Google.' }
  }
}

// Verifica disponibilidade de um modelo (e do Zimmer, se for pack) num intervalo.
// Conta as reservas internas **e** as marcações nas agendas Google mapeadas (não
// há dupla contagem: as reservas internas não criam eventos no calendário).
export async function verificarDisponibilidade(
  modelo: ModeloAluguer,
  inicio: string,
  fim: string
): Promise<ResultadoDisponibilidade> {
  const [zFrota, agenda] = await Promise.all([
    modelo.requer_zimmer ? frotaZimmer() : Promise.resolve(0),
    ocupacaoAgendas(inicio, fim),
  ])

  // Reservas que se sobrepõem ao intervalo [inicio, fim] e que ocupam frota.
  const { data } = await supabase
    .from('reservas')
    .select('modelo_id, com_zimmer, estado')
    .in('estado', ESTADOS_OCUPAM)
    .lte('data_inicio', fim)
    .gte('data_fim', inicio)

  const reservas = (data as { modelo_id: string | null; com_zimmer: boolean }[]) ?? []
  const reservasOcupadas = reservas.filter((r) => r.modelo_id === modelo.id).length
  // O Zimmer conta-se só pelas reservas: as marcações do calendário não dizem se
  // o aluguer leva pack.
  const zimmerOcupados = reservas.filter((r) => r.com_zimmer).length

  // As agendas falam em grupos de preço (o mapeamento calendário → modelo);
  // o catálogo fala em nomes de modelo. Sem grupo não há cruzamento possível.
  const grupo = grupoPreco(modelo.nome)
  const agendaMarcacoes = grupo ? (agenda.marcacoes ?? []).filter((m) => m.modelo_grupo === grupo) : []
  const agendaOcupadas = grupo ? (agenda.porGrupo?.[grupo] ?? 0) : 0
  // agendaFalhou = a ocupação das agendas pode estar incompleta (a leitura falhou,
  // toda ou em parte). Não mapear calendários, ou um modelo sem grupo, não é falha:
  // é só o cruzamento a não se aplicar.
  const agendaFalhou = !agenda.ok || !!agenda.erros?.length
  const agendaAviso = !agenda.ok
    ? `Agendas Google não lidas (${agenda.erro ?? 'erro desconhecido'}) — só as reservas foram contadas.`
    : agenda.erros?.length
      ? `Agendas não lidas na totalidade: ${agenda.erros.join(' · ')}`
      : agenda.semCalendarios
        ? 'Nenhum calendário mapeado em Alugueres → Agenda: só as reservas foram contadas.'
        : !grupo
          ? `O modelo "${modelo.nome}" não corresponde a nenhum grupo de preço, por isso as agendas não foram cruzadas.`
          : null

  const laserOcupadas = reservasOcupadas + agendaOcupadas
  const laserDisponiveis = modelo.frota - laserOcupadas
  const zimmerDisponiveis = zFrota - zimmerOcupados
  const disponivel = laserDisponiveis > 0 && (!modelo.requer_zimmer || zimmerDisponiveis > 0)

  return {
    modelo,
    frotaLaser: modelo.frota,
    laserOcupadas,
    reservasOcupadas,
    agendaOcupadas,
    agendaMarcacoes,
    agendaAviso,
    agendaFalhou,
    laserDisponiveis,
    requerZimmer: modelo.requer_zimmer,
    frotaZimmer: zFrota,
    zimmerOcupados,
    zimmerDisponiveis,
    disponivel,
  }
}
