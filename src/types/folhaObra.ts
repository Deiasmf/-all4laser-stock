export type EstadoFolha = 'rascunho' | 'pendente_assinatura' | 'concluida'

export type TipoServico =
  | 'Reparação'
  | 'Manutenção preventiva'
  | 'Preparação para saída'
  | 'Instalação'
  | 'Formação técnica'
  | 'Outro'

export type FolhaObra = {
  id: string
  numero: string
  data_intervencao: string
  cliente_id: string | null
  cliente_nome: string | null
  cliente_pais: string | null
  tecnico_id: string | null
  tecnico_nome: string | null
  tipo_servico: TipoServico | null
  equipamento_id: string | null
  equipamento_modelo: string | null
  equipamento_sn: string | null
  equipamento_ano: string | null
  codigos_erro: string | null
  problema_observado: string | null
  trabalho_realizado: string | null
  valor_cabeca_alex: number | null
  valor_transmissao_alex: number | null
  valor_cabeca_yag: number | null
  valor_transmissao_yag: number | null
  material_utilizado: string | null
  observacoes: string | null
  estado: EstadoFolha
  assinatura_tecnico_url: string | null
  assinatura_tecnico_at: string | null
  assinatura_cliente_url: string | null
  assinatura_cliente_at: string | null
  token_assinatura_cliente: string
  pdf_url: string | null
  nota_encomenda_id: string | null
  fo_origem_id: string | null   // FO de origem (quando foi "usada como base")
  bloqueada: boolean            // bloqueada após NE expedida (só admin desbloqueia)
  bloqueada_em: string | null
  criado_por: string | null
  created_at: string
  updated_at: string
}

// Registo do histórico de alterações de uma FO.
export type FolhaHistorico = {
  id: string
  folha_id: string
  campo: string
  valor_antigo: string | null
  valor_novo: string | null
  por_id: string | null
  por_nome?: string | null
  em: string
}

// Rótulos amigáveis dos campos no histórico/diff.
export const CAMPO_FOLHA_LABEL: Record<string, string> = {
  tipo_servico: 'Tipo de serviço',
  problema_observado: 'Problema observado',
  trabalho_realizado: 'Trabalho realizado',
  codigos_erro: 'Códigos de erro',
  material_utilizado: 'Material utilizado',
  observacoes: 'Observações',
  estado: 'Estado',
}

// Idade de uma FO em texto ("há 8 meses"), a partir da data de intervenção.
export function idadeFolha(dataIntervencao: string | null): { meses: number; texto: string } {
  if (!dataIntervencao) return { meses: 0, texto: '—' }
  const d = new Date(dataIntervencao)
  const agora = new Date()
  const meses = Math.max(0, (agora.getFullYear() - d.getFullYear()) * 12 + (agora.getMonth() - d.getMonth()))
  if (meses < 1) return { meses, texto: 'este mês' }
  if (meses < 12) return { meses, texto: `há ${meses} ${meses === 1 ? 'mês' : 'meses'}` }
  const anos = Math.floor(meses / 12)
  return { meses, texto: `há ${anos} ${anos === 1 ? 'ano' : 'anos'}` }
}

// Campos editáveis no formulário (o número, datas e assinaturas são geridos à parte)
export type FolhaInput = {
  data_intervencao: string
  cliente_id: string | null
  cliente_nome: string | null
  cliente_pais: string | null
  tecnico_id: string | null
  tecnico_nome: string | null
  tipo_servico: TipoServico | null
  equipamento_id: string | null
  equipamento_modelo: string | null
  equipamento_sn: string | null
  equipamento_ano: string | null
  codigos_erro: string | null
  problema_observado: string | null
  trabalho_realizado: string | null
  valor_cabeca_alex: number | null
  valor_transmissao_alex: number | null
  valor_cabeca_yag: number | null
  valor_transmissao_yag: number | null
  material_utilizado: string | null
  observacoes: string | null
  estado: EstadoFolha
}

export const TIPOS_SERVICO: TipoServico[] = [
  'Reparação',
  'Manutenção preventiva',
  'Preparação para saída',
  'Instalação',
  'Formação técnica',
  'Outro',
]

export const ESTADO_FOLHA_CONFIG: Record<EstadoFolha, { label: string; color: string; bg: string }> = {
  rascunho: { label: 'Rascunho', color: '#6B7280', bg: '#f1f2f4' },
  pendente_assinatura: { label: 'Pendente de assinatura', color: '#D4820A', bg: '#fdf2e3' },
  concluida: { label: 'Concluída', color: '#00A87A', bg: '#e6f7f1' },
}

export const ESTADO_FOLHA_OPCOES = Object.keys(ESTADO_FOLHA_CONFIG) as EstadoFolha[]

// Os valores de cabeça/transmissão só fazem sentido para equipamentos Candela Alex/Yag.
export function ehCandelaAlex(modelo: string | null | undefined): boolean {
  const m = (modelo ?? '').toLowerCase()
  return m.includes('alex') || m.includes('yag') || m.includes('gentlemax') || m.includes('gentlelase')
}
