// Tipos do módulo Marketing e Publicações (Fase 1).
// Ver docs/marketing-publications-implementation-plan.md

export type LinhaNegocio = 'venda' | 'aluguer' | 'assistencia' | 'formacao' | 'institucional'
export type ObjetivoPost =
  | 'notoriedade' | 'educacao' | 'prova' | 'captacao' | 'conversao' | 'retencao'
export type EstrategiaPromocao = 'organica' | 'candidata_paga' | 'paga_aprovada'
export type EstadoPost =
  | 'idea' | 'draft' | 'in_review' | 'approved' | 'scheduled'
  | 'publishing' | 'published' | 'changes_requested' | 'failed'
  | 'cancelled' | 'archived'
export type Plataforma =
  | 'instagram_feed' | 'instagram_story' | 'instagram_reel' | 'facebook' | 'linkedin'
export type FormatoVariante =
  | 'imagem' | 'carrossel' | 'video' | 'reel' | 'story' | 'documento' | 'texto'
export type EstadoVariante =
  | 'draft' | 'in_review' | 'approved' | 'scheduled' | 'publishing'
  | 'published' | 'changes_requested' | 'failed' | 'cancelled'
export type EstadoCampanha = 'rascunho' | 'ativa' | 'encerrada'
export type EstadoProposta = 'proposta' | 'aprovada' | 'rejeitada'

// ── Rótulos PT (para UI) ─────────────────────────────────────────────────────
export const LINHA_NEGOCIO_LABEL: Record<LinhaNegocio, string> = {
  venda: 'Venda', aluguer: 'Aluguer', assistencia: 'Assistência Técnica',
  formacao: 'Formação', institucional: 'Institucional',
}
export const OBJETIVO_LABEL: Record<ObjetivoPost, string> = {
  notoriedade: 'Notoriedade', educacao: 'Educação', prova: 'Prova',
  captacao: 'Captação', conversao: 'Conversão', retencao: 'Retenção',
}
export const PLATAFORMA_LABEL: Record<Plataforma, string> = {
  instagram_feed: 'Instagram Feed', instagram_story: 'Instagram Story',
  instagram_reel: 'Instagram Reel', facebook: 'Facebook', linkedin: 'LinkedIn',
}
export const FORMATO_LABEL: Record<FormatoVariante, string> = {
  imagem: 'Imagem', carrossel: 'Carrossel', video: 'Vídeo', reel: 'Reel',
  story: 'Story', documento: 'Documento', texto: 'Texto',
}
export const ESTADO_POST_LABEL: Record<EstadoPost, string> = {
  idea: 'Ideia', draft: 'Rascunho', in_review: 'Em revisão', approved: 'Aprovado',
  scheduled: 'Programado', publishing: 'A publicar', published: 'Publicado',
  changes_requested: 'Alterações pedidas', failed: 'Falhou', cancelled: 'Cancelado',
  archived: 'Arquivado',
}
export const ESTRATEGIA_LABEL: Record<EstrategiaPromocao, string> = {
  organica: 'Orgânica', candidata_paga: 'Candidata a paga', paga_aprovada: 'Paga aprovada',
}

// ── Entidades ────────────────────────────────────────────────────────────────
export type Campanha = {
  id: string
  numero: string | null
  nome: string
  objetivo_comercial: string | null
  linha_negocio: LinhaNegocio | null
  oferta: string | null
  mercados: string[]
  publicos: string | null
  data_inicio: string | null
  data_fim: string | null
  idiomas: string[]
  canais: string[]
  landing_url: string | null
  kpi_principal: string | null
  kpis_secundarios: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  estado: EstadoCampanha
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}
export type CampanhaInput = {
  nome: string
  objetivo_comercial?: string | null
  linha_negocio?: LinhaNegocio | null
  oferta?: string | null
  mercados?: string[]
  publicos?: string | null
  data_inicio?: string | null
  data_fim?: string | null
  idiomas?: string[]
  canais?: string[]
  landing_url?: string | null
  kpi_principal?: string | null
  kpis_secundarios?: string | null
  estado?: EstadoCampanha
  notas?: string | null
}

export type Post = {
  id: string
  numero: string | null
  titulo_interno: string
  campaign_id: string | null
  linha_negocio: LinhaNegocio | null
  objetivo: ObjetivoPost | null
  mercados: string[]
  idioma_base: string | null
  publico_alvo: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  prioridade: 'baixa' | 'normal' | 'alta'
  notas_internas: string | null
  canva_url: string | null
  estrategia_promocao: EstrategiaPromocao
  estado_global: EstadoPost
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}
export type PostInput = {
  titulo_interno: string
  campaign_id?: string | null
  linha_negocio?: LinhaNegocio | null
  objetivo?: ObjetivoPost | null
  mercados?: string[]
  idioma_base?: string | null
  publico_alvo?: string | null
  prioridade?: 'baixa' | 'normal' | 'alta'
  notas_internas?: string | null
  canva_url?: string | null
  estrategia_promocao?: EstrategiaPromocao
}

export type Variante = {
  id: string
  post_id: string
  plataforma: Plataforma
  account_ref: string | null
  idioma: string | null
  texto: string | null
  titulo: string | null
  cta: string | null
  url_destino: string | null
  hashtags: string[]
  primeiro_comentario: string | null
  alt_text: string | null
  formato: FormatoVariante | null
  data_agendada: string | null
  estado: EstadoVariante
  created_at: string
  updated_at: string
}
export type VarianteInput = {
  plataforma: Plataforma
  idioma?: string | null
  texto?: string | null
  titulo?: string | null
  cta?: string | null
  url_destino?: string | null
  hashtags?: string[]
  primeiro_comentario?: string | null
  alt_text?: string | null
  formato?: FormatoVariante | null
  data_agendada?: string | null
}

export type PostEquipamento = {
  id: string
  post_id: string
  equipamento_id: string | null
  marca: string | null
  modelo: string | null
}

export type Aprovacao = {
  id: string
  post_id: string
  variant_id: string | null
  acao: 'submeteu' | 'pediu_alteracoes' | 'aprovou' | 'rejeitou' | 'publicou' | 'cancelou'
  por_id: string | null
  por_nome: string | null
  comentario: string | null
  created_at: string
}

export type ComplianceItem = {
  id: string
  post_id: string
  item: string
  estado: 'confirmado' | 'nao_aplicavel' | 'pendente'
  justificacao: string | null
  por_nome: string | null
  updated_at: string
}

export type PropostaPaga = {
  id: string
  post_id: string
  motivo: string | null
  objetivo: 'alcance' | 'trafego' | 'leads' | 'conversao' | null
  mercado: string | null
  publico: string | null
  periodo_inicio: string | null
  periodo_fim: string | null
  orcamento_proposto: number | null
  estado: EstadoProposta
  aprovado_por_nome: string | null
  aprovado_em: string | null
  campanha_externa_ref: string | null
  observacoes: string | null
  created_at: string
}

// Detalhe agregado de uma publicação (para o ecrã de detalhe).
export type PostDetalhe = Post & {
  variantes: Variante[]
  equipamentos: PostEquipamento[]
  checklist: ComplianceItem[]
  aprovacoes: Aprovacao[]
  proposta_paga: PropostaPaga | null
  campanha_nome: string | null
}

// Itens da checklist de conformidade (§7 do briefing).
export const CHECKLIST_ITENS: { chave: string; label: string }[] = [
  { chave: 'marca_modelo', label: 'Marca e modelo do equipamento confirmados' },
  { chave: 'foto_corresponde', label: 'Fotografia corresponde ao equipamento referido' },
  { chave: 'direito_imagem', label: 'Direito de utilização da imagem confirmado' },
  { chave: 'logo_oficial', label: 'Logótipo oficial All4laser utilizado' },
  { chave: 'texto_revisto', label: 'Texto revisto no idioma selecionado' },
  { chave: 'mercado_publico', label: 'Mercado e público confirmados' },
  { chave: 'stock', label: 'Stock e disponibilidade confirmados (quando mencionados)' },
  { chave: 'preco', label: 'Preço, moeda, impostos e condições confirmados (quando mencionados)' },
  { chave: 'garantia_formacao', label: 'Garantia e formação confirmadas (quando mencionadas)' },
  { chave: 'especificacoes', label: 'Especificações e certificações confirmadas (quando mencionadas)' },
  { chave: 'alegacoes_clinicas', label: 'Alegações clínicas revistas' },
  { chave: 'cta_contacto', label: 'CTA e contacto corretos' },
  { chave: 'consentimento_pessoas', label: 'Autorização/consentimento para imagens de pessoas' },
  { chave: 'qr_url', label: 'QR code e URL testados (quando aplicável)' },
]
