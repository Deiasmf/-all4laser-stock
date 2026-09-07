import { PROMO_ETIQUETA } from '@/types/marketing'
import type { EstrategiaPromocao } from '@/types/marketing'

// Etiqueta visível do tipo de promoção (texto + cor + ícone, para acessibilidade
// não depende só da cor). "Orgânica" (azul) vs "A promover" (roxo, megafone).
export default function EtiquetaPromocao({ estrategia, tamanho = 'normal' }: {
  estrategia: EstrategiaPromocao
  tamanho?: 'normal' | 'mini'
}) {
  const e = PROMO_ETIQUETA[estrategia]
  const mini = tamanho === 'mini'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
      background: e.bg, color: e.c, borderRadius: 999, fontWeight: 700,
      fontSize: mini ? 10.5 : 12.5, padding: mini ? '1px 6px' : '3px 10px',
    }}>
      <span aria-hidden>{e.icone}</span>{e.label}
    </span>
  )
}
