// Tipos partilhados da extração de cartas de porte (cliente + servidor).
// Puro, sem dependências de servidor (não importa o SDK Anthropic nem Supabase),
// para poder ser usado no componente de confirmação (cliente).
import type { TipoTransporte, Direcao, EstadoEnvio } from './tracking'

export type Confianca = 'alta' | 'media' | 'baixa'

export type CampoCarta =
  | 'transportadora' | 'tipo_transporte' | 'tracking_number' | 'awb'
  | 'remetente_nome' | 'remetente_morada' | 'remetente_pais'
  | 'destinatario_nome' | 'destinatario_morada' | 'destinatario_pais'
  | 'num_volumes' | 'peso_kg' | 'dimensoes' | 'data_expedicao' | 'servico'

export const CAMPOS_CARTA: CampoCarta[] = [
  'transportadora', 'tipo_transporte', 'tracking_number', 'awb',
  'remetente_nome', 'remetente_morada', 'remetente_pais',
  'destinatario_nome', 'destinatario_morada', 'destinatario_pais',
  'num_volumes', 'peso_kg', 'dimensoes', 'data_expedicao', 'servico',
]

// Resultado bruto da extração (o que a IA leu do documento).
export type CartaPorteExtraida = {
  transportadora: string | null
  tipo_transporte: 'expresso' | 'carga_aerea' | 'outro' | null
  tracking_number: string | null
  awb: string | null
  remetente_nome: string | null
  remetente_morada: string | null
  remetente_pais: string | null
  destinatario_nome: string | null
  destinatario_morada: string | null
  destinatario_pais: string | null
  num_volumes: number | null
  peso_kg: number | null
  dimensoes: string | null
  data_expedicao: string | null
  servico: string | null
  confianca: Partial<Record<CampoCarta, Confianca>>
}

// Envio pré-preenchido a partir da extração + cruzamento (mesma forma de EnvioInput).
export type SugestaoEnvio = {
  tracking_number: string | null
  awb: string | null
  awb_check_valido: boolean | null
  tipo_transporte: TipoTransporte
  carrier_id: string | null
  carrier_nome: string | null
  direcao: Direcao
  descricao_conteudo: string | null
  entidade_tipo: 'cliente' | 'fornecedor' | null
  cliente_id: string | null
  supplier_id: string | null
  entidade_nome: string | null
  estado: EstadoEnvio
  data_expedicao: string | null
  entrega_prevista: string | null
  entrega_efetiva: string | null
  notas: string | null
  aeroporto_origem: string | null
  aeroporto_destino: string | null
  num_volumes: number | null
  peso_kg: number | null
}

// Envio duplicado já registado (mesmo tracking/AWB).
export type EnvioDuplicado = {
  id: string
  descricao: string | null
  tracking_number: string | null
  awb: string | null
  tem_anexo: boolean
}

// Encomenda (EP) da mesma entidade, recente e sem tracking — candidata a ligação.
export type SugestaoEp = {
  id: string
  numero: string
}

// Resposta do endpoint de extração para o ecrã de confirmação.
export type RespostaExtracao = {
  ok: boolean
  parcial: boolean               // extração falhou/baixa confiança em campos críticos
  erro: string | null
  sugestao: SugestaoEnvio
  confianca: Partial<Record<CampoCarta, Confianca>>
  extraido: CartaPorteExtraida
  duplicado: EnvioDuplicado | null
  sugestoesEp: SugestaoEp[]        // EPs da entidade sem tracking (ponto 10)
  avisos: string[]
}
