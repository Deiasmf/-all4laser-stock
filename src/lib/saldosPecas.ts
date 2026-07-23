import { supabase } from './supabase'

// Um movimento = uma reparação (linha da view parts_movements).
export type ParteMovimento = {
  id: string
  entidade: string
  peca: string
  peca_id: string | null
  referencia: string | null
  serial_number: string | null
  sn_avariado: string | null
  tipo_dono: string | null
  status: string | null
  data_saida: string | null
  data_entrada: string | null
  enviado: number
  recebido: number
  estado: 'recebido' | 'em_reparacao' | 'sem_retorno'
  data: string | null
}

// Carrega todos os movimentos (a agregação por entidade/peça é feita no cliente,
// para os filtros de data/entidade/peça serem instantâneos e coerentes).
// Página em lotes de 1000 (limite por omissão do PostgREST) até vir tudo.
const COLS_MOV = 'id, entidade, peca, peca_id, referencia, serial_number, sn_avariado, tipo_dono, status, data_saida, data_entrada, enviado, recebido, estado, data'
export async function listarMovimentosPecas(): Promise<ParteMovimento[]> {
  const LOTE = 1000
  const todos: ParteMovimento[] = []
  for (let offset = 0; ; offset += LOTE) {
    const { data } = await supabase
      .from('parts_movements')
      .select(COLS_MOV)
      .order('data', { ascending: false })
      .range(offset, offset + LOTE - 1)
    const lote = (data as ParteMovimento[]) ?? []
    todos.push(...lote)
    if (lote.length < LOTE) break
  }
  return todos
}

// Data ISO (YYYY-MM-DD) -> DD/MM/YYYY
export function dataPt(iso: string | null): string {
  if (!iso) return '—'
  const s = iso.slice(0, 10)
  const p = s.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s
}

// Dias desde uma data ISO até hoje (para o alerta "em reparação há +X dias").
export function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso.slice(0, 10) + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}
