import {
  listarMovimentos, alocarFaturas, entidadeIdDe, hojeISO,
  type MovimentoCC, type EntidadeTipo,
} from './contasCorrentes'

// Alertas financeiros calculados em tempo real a partir dos movimentos da conta
// corrente (via alocação FIFO). Não há tabela nem sincronização: o alerta reflete
// sempre a realidade e desaparece quando a situação se resolve (ex.: pagamento).

export type CategoriaAlerta = 'vencido_receber' | 'vencido_pagar' | 'a_vencer' | 'saldo_credor'
export type Severidade = 'critico' | 'aviso' | 'info'

export type Alerta = {
  id: string
  categoria: CategoriaAlerta
  severidade: Severidade
  entidade_tipo: EntidadeTipo
  entidade_id: string
  entidade_nome: string
  documento: string | null // "Fatura FT2026/1" (null para saldo credor)
  valor: number
  dias: number // >0 = dias de atraso; <=0 = dias até vencer (a_vencer)
  mensagem: string
}

const DIA = 86400000
function diasAtraso(hoje: string, venc: string): number {
  return Math.floor((Date.parse(hoje) - Date.parse(venc)) / DIA)
}

const LABEL_TIPO: Record<string, string> = {
  fatura: 'Fatura', nota_credito: 'Nota de crédito', recibo: 'Recibo',
  pagamento: 'Pagamento', adiantamento: 'Adiantamento',
}

// Gera os alertas a partir dos movimentos. `diasAviso` = janela do "a vencer".
export function gerarAlertas(movs: MovimentoCC[], hoje = hojeISO(), diasAviso = 7): Alerta[] {
  // Agrupa por entidade.
  const grupos = new Map<string, MovimentoCC[]>()
  for (const m of movs) {
    const id = entidadeIdDe(m)
    if (!id) continue
    const k = `${m.entidade_tipo}:${id}`
    const arr = grupos.get(k)
    if (arr) arr.push(m)
    else grupos.set(k, [m])
  }

  const alertas: Alerta[] = []
  for (const ms of grupos.values()) {
    const tipo = ms[0].entidade_tipo
    const entidadeId = entidadeIdDe(ms[0]) as string
    const nome = ms.find((m) => m.entidade_nome)?.entidade_nome ?? '—'
    const aloc = alocarFaturas(ms)

    // Faturas por liquidar → vencidas ou a vencer.
    for (const m of ms) {
      if (m.tipo_documento !== 'fatura') continue
      const pl = aloc.get(m.id)?.porLiquidar ?? 0
      if (pl <= 0 || !m.data_vencimento) continue
      const d = diasAtraso(hoje, m.data_vencimento)
      const doc = `${LABEL_TIPO[m.tipo_documento] ?? 'Documento'}${m.documento_ref ? ' ' + m.documento_ref : ''}`
      if (d > 0) {
        alertas.push({
          id: `venc:${m.id}`,
          categoria: tipo === 'cliente' ? 'vencido_receber' : 'vencido_pagar',
          severidade: d > 90 ? 'critico' : 'aviso',
          entidade_tipo: tipo, entidade_id: entidadeId, entidade_nome: nome,
          documento: doc, valor: pl, dias: d,
          mensagem: `${tipo === 'cliente' ? 'A receber' : 'A pagar'} · vencido há ${d} dia${d === 1 ? '' : 's'}`,
        })
      } else if (d >= -diasAviso) {
        const faltam = -d
        alertas.push({
          id: `avencer:${m.id}`,
          categoria: 'a_vencer',
          severidade: faltam <= 2 ? 'aviso' : 'info',
          entidade_tipo: tipo, entidade_id: entidadeId, entidade_nome: nome,
          documento: doc, valor: pl, dias: d,
          mensagem: faltam === 0 ? 'Vence hoje' : `Vence em ${faltam} dia${faltam === 1 ? '' : 's'}`,
        })
      }
    }

    // Divergência: saldo credor (a entidade tem crédito sem fatura correspondente).
    const saldo = ms.reduce((s, m) => s + m.valor_debito - m.valor_credito, 0)
    if (saldo < -0.01) {
      alertas.push({
        id: `credor:${tipo}:${entidadeId}`,
        categoria: 'saldo_credor',
        severidade: 'info',
        entidade_tipo: tipo, entidade_id: entidadeId, entidade_nome: nome,
        documento: null, valor: Math.abs(saldo), dias: 0,
        mensagem: 'Saldo credor (adiantamento ou nota de crédito sem fatura)',
      })
    }
  }

  // Ordena: críticos primeiro, depois maior atraso, depois maior valor.
  const peso: Record<Severidade, number> = { critico: 0, aviso: 1, info: 2 }
  return alertas.sort((a, b) =>
    peso[a.severidade] - peso[b.severidade] || b.dias - a.dias || b.valor - a.valor
  )
}

export type ResumoAlertas = {
  vencidoReceber: { n: number; total: number }
  vencidoPagar: { n: number; total: number }
  aVencer: { n: number; total: number }
  divergencias: { n: number; total: number }
  criticos: number
}

export function resumoAlertas(alertas: Alerta[]): ResumoAlertas {
  const acc = (cat: CategoriaAlerta) => {
    const arr = alertas.filter((a) => a.categoria === cat)
    return { n: arr.length, total: arr.reduce((s, a) => s + a.valor, 0) }
  }
  return {
    vencidoReceber: acc('vencido_receber'),
    vencidoPagar: acc('vencido_pagar'),
    aVencer: acc('a_vencer'),
    divergencias: acc('saldo_credor'),
    criticos: alertas.filter((a) => a.severidade === 'critico').length,
  }
}

// Carrega os movimentos e devolve já os alertas (conveniência para a página).
export async function carregarAlertas(diasAviso = 7): Promise<Alerta[]> {
  const movs = await listarMovimentos()
  return gerarAlertas(movs, hojeISO(), diasAviso)
}
