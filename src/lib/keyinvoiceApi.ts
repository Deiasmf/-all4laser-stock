// ─────────────────────────────────────────────────────────────────────────────
// Cliente REST da API do Keyinvoice (API5). SÓ PARA O SERVIDOR — usa a
// KEYINVOICE_API_KEY (segredo) e nunca deve ser importado no cliente.
//
// Fluxo: POST ao endpoint com header `Apikey` e {method:'authenticate'} devolve um
// `Sid` (sessão, 3600s). As chamadas seguintes usam o header `Sid` e {method,...}.
// Reutilizamos o Sid enquanto for válido (a doc pede para não re-autenticar a
// cada chamada; limite de 5000 chamadas/dia).
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINT = process.env.KEYINVOICE_ENDPOINT || 'https://login.keyinvoice.com/API5.php'

type Resposta = { Status: number; Sid?: string; Data?: unknown; ErrorMessage?: string }

// Cache do Sid por instância (best-effort; as funções serverless são efémeras).
let sessao: { sid: string; expira: number } | null = null

function apiKey(): string {
  const k = process.env.KEYINVOICE_API_KEY
  if (!k) throw new Error('KEYINVOICE_API_KEY não configurada no servidor.')
  return k
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// POST resiliente: timeout por tentativa + repetição em falhas de rede (a API do
// Keyinvoice ocasionalmente fecha a ligação em séries de chamadas rápidas).
async function postJson(headers: Record<string, string>, body: unknown): Promise<Resposta> {
  const TENTATIVAS = 3
  let ultimoErro: unknown = null
  for (let t = 0; t < TENTATIVAS; t++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      })
      const texto = await res.text()
      try { return JSON.parse(texto) as Resposta } catch {
        throw new Error(`Resposta inválida do Keyinvoice (HTTP ${res.status}).`)
      }
    } catch (e) {
      ultimoErro = e
      // Erro de parsing/HTTP não vale a pena repetir; falhas de rede sim.
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.startsWith('Resposta inválida')) throw e
      if (t < TENTATIVAS - 1) await sleep(600 * (t + 1))
    }
  }
  const m = ultimoErro instanceof Error ? ultimoErro.message : 'fetch failed'
  throw new Error(`Falha de rede a contactar o Keyinvoice (${m}).`)
}

// Autentica e devolve o Sid (com cache). Renova quando faltam <300s.
export async function autenticar(forcar = false): Promise<string> {
  const agora = Date.now()
  if (!forcar && sessao && sessao.expira - agora > 300_000) return sessao.sid
  const j = await postJson({ Apikey: apiKey() }, { method: 'authenticate' })
  if (j.Status !== 1 || !j.Sid) {
    throw new Error(j.ErrorMessage || 'Falha na autenticação com o Keyinvoice.')
  }
  sessao = { sid: j.Sid, expira: agora + 3600_000 }
  return j.Sid
}

// Chama um método autenticado. Se a sessão tiver expirado, re-autentica 1x.
export async function chamar<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const exec = async (sid: string) => postJson({ Sid: sid }, { method, ...params })
  let j = await exec(await autenticar())
  if (j.Status !== 1) {
    // Pode ser sessão expirada → tenta uma vez com Sid novo.
    j = await exec(await autenticar(true))
  }
  if (j.Status !== 1) throw new Error(j.ErrorMessage || `Falha no método "${method}" do Keyinvoice.`)
  return j.Data as T
}

// ─── Métodos usados ────────────────────────────────────────────────────────────

export type EmpresaKI = {
  VATIN?: string; Name?: string; Address?: string; Locality?: string
  PostalCode?: string; Phone?: string; Email?: string
}

// Resumo dos dados da empresa — serve para testar a ligação de ponta a ponta.
export function obterEmpresa(): Promise<EmpresaKI> {
  return chamar<EmpresaKI>('company')
}

// ─── Documentos ────────────────────────────────────────────────────────────────

export type DocListItem = {
  DocType?: number | string
  DocSeries?: number | string
  DocNum?: number | string
  Date?: string
  IdClient?: number | string
  VATIN?: string
  ClientName?: string
  GrossTotal?: number | string
}

// Lista 100 documentos do tipo indicado a partir de `offset`. Se `docSeries` não
// for indicada, a API usa a série definida na chave (que só serve alguns tipos).
export async function listarDocumentos(
  docType: number,
  offset = 0,
  docSeries?: number | string
): Promise<DocListItem[]> {
  const data = await chamar<{ Documents?: DocListItem[] }>('documentsList', {
    DocType: String(docType),
    Offset: String(offset),
    ...(docSeries != null && docSeries !== '' ? { DocSeries: String(docSeries) } : {}),
  })
  return data?.Documents ?? []
}

export type SerieDoc = { IdSerie?: number | string; Name?: string; Ref?: string; Info1?: string; Info2?: string }

// Séries activas de um tipo de documento.
export async function listarSeries(docType: number): Promise<SerieDoc[]> {
  const data = await chamar<{ Series?: SerieDoc[] }>('listDocumentSeries', { DocType: docType })
  return data?.Series ?? []
}

// Valor ainda pendente de um documento (0 = totalmente liquidado). null se indeterminado.
export async function valorPendente(
  docType: number | string,
  docNum: number | string,
  docSeries?: number | string
): Promise<number | null> {
  const data = await chamar<{ Value?: number | string }>('checkIfSettle', {
    DocType: String(docType),
    DocNum: String(docNum),
    ...(docSeries != null && docSeries !== '' ? { DocSeries: String(docSeries) } : {}),
  })
  const v = Number(data?.Value)
  return isNaN(v) ? null : v
}
