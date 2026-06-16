// Utilitários de UI partilhados pelo dashboard e pela shell.

// Iniciais a partir do nome (máx. 2 letras). Fallback para o email ou "?".
export function iniciais(nome?: string | null, email?: string | null): string {
  const base = (nome ?? '').trim()
  if (base) {
    const partes = base.split(/\s+/)
    const a = partes[0]?.[0] ?? ''
    const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
    return (a + b).toUpperCase()
  }
  return (email?.[0] ?? '?').toUpperCase()
}

// Saudação conforme a hora do dia.
export function saudacao(d = new Date()): string {
  const h = d.getHours()
  if (h < 13) return 'Bom dia'
  if (h < 20) return 'Boa tarde'
  return 'Boa noite'
}

// Data por extenso em PT: "Terça-feira, 16 de junho de 2026"
export function dataPorExtenso(d = new Date()): string {
  const txt = d.toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

// Tempo relativo curto: "agora", "há 5min", "há 2h", "há 3d"
export function tempoRelativo(iso: string): string {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const seg = Math.floor((Date.now() - t) / 1000)
  if (seg < 60) return 'agora'
  const min = Math.floor(seg / 60)
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const dias = Math.floor(h / 24)
  return `há ${dias}d`
}
