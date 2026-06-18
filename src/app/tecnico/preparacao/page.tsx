'use client'

import NeFaseSimples from '@/components/NeFaseSimples'

export default function TecnicoPreparacaoPage() {
  return (
    <NeFaseSimples
      fase="tecnico_preparacao"
      titulo="Equipamentos em Preparação Técnica"
      botaoLabel="Concluir Preparação Técnica"
      voltarHref="/tecnico"
      voltarLabel="Técnico"
    />
  )
}
