'use client'

import NeFaseSimples from '@/components/NeFaseSimples'

export default function LogisticaPreparacaoPage() {
  return (
    <NeFaseSimples
      fase="logistica_preparacao"
      titulo="Equipamentos em Preparação"
      botaoLabel="Concluir — Entregar ao Técnico"
      voltarHref="/logistico"
      voltarLabel="Logística"
    />
  )
}
