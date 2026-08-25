import { supabase } from './supabase'

export const BUCKET_MEDIA = 'equipamentos-media'

// Limite de tamanho por ficheiro. Plano Pro do Supabase.
// Tem de coincidir com: (1) o limite do bucket `equipamentos-media` e
// (2) o limite GLOBAL de upload do projeto (Definições de Storage no painel).
export const LIMITE_FICHEIRO_MB = 500

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

// Encolhe uma imagem para no máx. `maxLado` px (mantém proporção) e converte a
// JPEG, para as fotos das fichas serem leves. Vídeos e não-imagens passam
// intactos. Se algo falhar, devolve o ficheiro original (nunca bloqueia).
export async function comprimirImagem(file: File, maxLado = 2000, qualidade = 0.85): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
    if (escala >= 1) { bitmap.close?.(); return file }        // já é pequena
    const w = Math.round(bitmap.width * escala)
    const h = Math.round(bitmap.height * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return file }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', qualidade))
    if (!blob) return file
    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], nome, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// Define a foto de capa do equipamento (só uma; o índice único garante-o).
export async function definirCapaMedia(equipamentoId: string, mediaId: string) {
  await supabase.from('media').update({ capa: false }).eq('equipamento_id', equipamentoId)
  return supabase.from('media').update({ capa: true }).eq('id', mediaId)
}

// Persiste a ordem atual (ordem = posição na lista dada).
export async function guardarOrdemMedia(idsOrdenados: string[]) {
  await Promise.all(idsOrdenados.map((id, i) =>
    supabase.from('media').update({ ordem: i }).eq('id', id)))
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
  ordemInicial = 0,
): Promise<ResultadoUpload> {
  const limiteBytes = LIMITE_FICHEIRO_MB * 1024 * 1024
  const res: ResultadoUpload = { carregados: 0, total: ficheiros.length, grandes: [], falhas: [] }

  let feitos = 0
  for (const original of ficheiros) {
    feitos++
    onProgresso?.(feitos, ficheiros.length)

    // Imagens são encolhidas para ~2000px (fichas leves); vídeos passam intactos.
    const ficheiro = await comprimirImagem(original)

    // Verificação de tamanho antes de enviar (evita um erro técnico do servidor).
    if (ficheiro.size > limiteBytes) {
      res.grandes.push(original.name)
      continue
    }

    const caminho = `${equipamentoId}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
    const { error } = await supabase.storage.from(BUCKET_MEDIA).upload(caminho, ficheiro)
    if (error) {
      // Rede/servidor podem rejeitar por tamanho mesmo assim: tratar como "grande".
      if (/exceed|maximum|too large|payload|size/i.test(error.message)) res.grandes.push(original.name)
      else res.falhas.push({ nome: original.name, motivo: error.message })
      continue
    }

    const { data: pub } = supabase.storage.from(BUCKET_MEDIA).getPublicUrl(caminho)
    const tipo = ficheiro.type.startsWith('video') ? 'video' : 'foto'
    const { error: erroBd } = await supabase.from('media').insert({
      equipamento_id: equipamentoId,
      url: pub.publicUrl,
      caminho,
      tipo,
      nome: original.name,
      ordem: ordemInicial + feitos,
    })
    if (erroBd) { res.falhas.push({ nome: original.name, motivo: erroBd.message }); continue }

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
