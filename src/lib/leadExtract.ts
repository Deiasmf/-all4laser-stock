// Extração dos campos de uma lead a partir do email, com a Claude API
// (modelo Haiku — barato e rápido). Usa tool-use forçado para obter sempre
// um objeto com a forma certa. Só corre no servidor (precisa de ANTHROPIC_API_KEY).
import Anthropic from '@anthropic-ai/sdk'
import type { EmailLead } from './gmailRead'
import type { FonteLead } from './leadSources'

export type LeadExtraida = {
  nome: string | null
  email: string | null
  telefone: string | null
  modelo_interesse: string | null
  cidade: string | null           // cidade ou país do interessado
  mensagem: string | null
}

const MODELO = 'claude-haiku-4-5'
const LIMITE_CORPO = 6000         // limita tokens (o corpo do Bimedis é curto)

const nulavel = (descricao: string) => ({ type: ['string', 'null'], description: descricao })

const TOOL: Anthropic.Tool = {
  name: 'registar_lead',
  description: 'Regista os dados de contacto extraídos da lead.',
  input_schema: {
    type: 'object',
    properties: {
      nome: nulavel('Nome da pessoa/empresa interessada (o comprador), não o portal.'),
      email: nulavel('Email de contacto do interessado.'),
      telefone: nulavel('Telefone/telemóvel do interessado.'),
      modelo_interesse: nulavel('Equipamento/modelo em questão (ex.: ALMA Soprano Titanium).'),
      cidade: nulavel('Cidade ou país do interessado, se indicado.'),
      mensagem: nulavel('Resumo curto do pedido, na língua original (traduções ignoram-se).'),
    },
    required: ['nome', 'email', 'telefone', 'modelo_interesse', 'cidade', 'mensagem'],
  },
}

const SISTEMA = `És um assistente que extrai dados de leads (potenciais clientes) de emails da All4laser,
empresa de equipamentos de medicina estética. Os emails podem ser notificações de portais
(ex.: Bimedis) ou submissões do formulário do site. O contacto do interessado costuma estar
DENTRO do corpo (nome, telefone e email do comprador), às vezes noutra língua com autotradução.
Extrai os dados do INTERESSADO (não do portal nem da All4laser). Se um campo não existir, devolve null.
Nunca inventes dados.`

let _client: Anthropic | null = null
function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY.')
  return (_client ??= new Anthropic())
}

export async function extrairLead(email: EmailLead, fonte: FonteLead): Promise<LeadExtraida> {
  const corpo = email.corpo.slice(0, LIMITE_CORPO)
  const conteudo =
    `Fonte: ${fonte}\n` +
    `Remetente: ${email.remetente}\n` +
    `Assunto: ${email.assunto}\n\n` +
    `Corpo:\n${corpo}`

  const resp = await cliente().messages.create({
    model: MODELO,
    max_tokens: 1024,
    system: SISTEMA,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'registar_lead' },
    messages: [{ role: 'user', content: conteudo }],
  })

  const bloco = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  const dados = (bloco?.input ?? {}) as Partial<LeadExtraida>
  // Sentinelas que o modelo às vezes devolve em vez de null.
  const SENTINELAS = new Set(['', 'unknown', '<unknown>', 'n/a', 'na', 'null', 'none', 'desconhecido', 'sem nome', '-'])
  const t = (v: unknown) => {
    if (typeof v !== 'string') return null
    const s = v.trim()
    return s && !SENTINELAS.has(s.toLowerCase()) ? s : null
  }
  return {
    nome: t(dados.nome),
    email: t(dados.email),
    telefone: t(dados.telefone),
    modelo_interesse: t(dados.modelo_interesse),
    cidade: t(dados.cidade),
    mensagem: t(dados.mensagem),
  }
}
