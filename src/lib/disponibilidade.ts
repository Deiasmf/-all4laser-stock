import { supabase } from './supabase'
import { ESTADOS_OCUPAM, ZIMMER_PACK, type ModeloAluguer } from '@/types/reserva'

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
  laserDisponiveis: number
  requerZimmer: boolean
  frotaZimmer: number
  zimmerOcupados: number
  zimmerDisponiveis: number
  disponivel: boolean
}

// Verifica disponibilidade de um modelo (e do Zimmer, se for pack) num intervalo.
export async function verificarDisponibilidade(
  modelo: ModeloAluguer,
  inicio: string,
  fim: string
): Promise<ResultadoDisponibilidade> {
  const zFrota = modelo.requer_zimmer ? await frotaZimmer() : 0

  // Reservas que se sobrepõem ao intervalo [inicio, fim] e que ocupam frota.
  const { data } = await supabase
    .from('reservas')
    .select('modelo_id, com_zimmer, estado')
    .in('estado', ESTADOS_OCUPAM)
    .lte('data_inicio', fim)
    .gte('data_fim', inicio)

  const reservas = (data as { modelo_id: string | null; com_zimmer: boolean }[]) ?? []
  const laserOcupadas = reservas.filter((r) => r.modelo_id === modelo.id).length
  const zimmerOcupados = reservas.filter((r) => r.com_zimmer).length

  const laserDisponiveis = modelo.frota - laserOcupadas
  const zimmerDisponiveis = zFrota - zimmerOcupados
  const disponivel = laserDisponiveis > 0 && (!modelo.requer_zimmer || zimmerDisponiveis > 0)

  return {
    modelo,
    frotaLaser: modelo.frota,
    laserOcupadas,
    laserDisponiveis,
    requerZimmer: modelo.requer_zimmer,
    frotaZimmer: zFrota,
    zimmerOcupados,
    zimmerDisponiveis,
    disponivel,
  }
}
