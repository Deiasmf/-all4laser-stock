import { supabase } from './supabase'

export const BUCKET_MEDIA = 'equipamentos-media'

// Limite de tamanho por ficheiro. Plano Pro do Supabase.
// Tem de coincidir com: (1) o limite do bucket `equipamentos-media` e
// (2) o limite GLOBAL de upload do projeto (Definições de Storage no painel).
export const LIMITE_FICHEIRO_MB = 500

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

export type ResultadoUpload = {
  carregados: number
  total: number
  grandes: string[]                       // ficheiros acima do limite de tamanho
  falhas: { nome: string; motivo: string }[]
}

// Carrega vários ficheiros (fotos/vídeos) para um equipamento, um a um.
// Não rebenta no primeiro erro: salta o ficheiro problemático e continua,
// devolvendo no fim um resumo de tudo o que correu bem e mal.
export async function carregarMediaEquipamento(
  equipamentoId: string,
  ficheiros: File[],
  onProgresso?: (feitos: number, total: number) => void,
): Promise<ResultadoUpload> {
  const limiteBytes = LIMITE_FICHEIRO_MB * 1024 * 1024
  const res: ResultadoUpload = { carregados: 0, total: ficheiros.length, grandes: [], falhas: [] }

  let feitos = 0
  for (const ficheiro of ficheiros) {
    feitos++
    onProgresso?.(feitos, ficheiros.length)

    // Verificação de tamanho antes de enviar (evita um erro técnico do servidor).
    if (ficheiro.size > limiteBytes) {
      res.grandes.push(ficheiro.name)
      continue
    }

    const caminho = `${equipamentoId}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
    const { error } = await supabase.storage.from(BUCKET_MEDIA).upload(caminho, ficheiro)
    if (error) {
      // Rede/servidor podem rejeitar por tamanho mesmo assim: tratar como "grande".
      if (/exceed|maximum|too large|payload|size/i.test(error.message)) res.grandes.push(ficheiro.name)
      else res.falhas.push({ nome: ficheiro.name, motivo: error.message })
      continue
    }

    const { data: pub } = supabase.storage.from(BUCKET_MEDIA).getPublicUrl(caminho)
    const tipo = ficheiro.type.startsWith('video') ? 'video' : 'foto'
    const { error: erroBd } = await supabase.from('media').insert({
      equipamento_id: equipamentoId,
      url: pub.publicUrl,
      caminho,
      tipo,
      nome: ficheiro.name,
    })
    if (erroBd) { res.falhas.push({ nome: ficheiro.name, motivo: erroBd.message }); continue }

    res.carregados++
  }

  return res
}

// Mensagem de resumo legível (pt-PT) a partir do resultado. Devolve null
// quando não há nada a dizer (lista vazia).
export function resumoUpload(r: ResultadoUpload): string | null {
  const partes: string[] = []
  if (r.carregados > 0) partes.push(`${r.carregados} ficheiro(s) carregado(s) ✓`)
  if (r.grandes.length > 0) {
    partes.push(`${r.grandes.length} demasiado grande(s) (máx. ${LIMITE_FICHEIRO_MB} MB): ${r.grandes.join(', ')}`)
  }
  if (r.falhas.length > 0) {
    partes.push(`${r.falhas.length} com erro: ${r.falhas.map((f) => f.nome).join(', ')}`)
  }
  return partes.length ? partes.join('\n') : null
}

// True quando algo não correu bem (para mostrar o aviso a vermelho/laranja).
export function houveProblemas(r: ResultadoUpload): boolean {
  return r.grandes.length > 0 || r.falhas.length > 0
}
