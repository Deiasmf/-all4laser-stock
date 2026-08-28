'use client'

// Pré-visualização do layout da Ficha de Produto (dados de exemplo), para rever
// o desenho do PDF sem precisar de um equipamento real. Uso interno.
import { useEffect, useState } from 'react'
import { gerarPdfFichaProduto, type FichaProdutoDados, type IdiomaFicha } from '@/lib/fichaProdutoPdf'

const FOTOS = [
  'https://lykfbclxsyazerffcpta.supabase.co/storage/v1/object/public/equipamentos-media/69bf793b-eeab-4864-b632-78a6cd78c2bd/1780157815475-5.png',
  'https://lykfbclxsyazerffcpta.supabase.co/storage/v1/object/public/equipamentos-media/69bf793b-eeab-4864-b632-78a6cd78c2bd/1780157831353-Imagens_Finalistas_3.png',
  'https://lykfbclxsyazerffcpta.supabase.co/storage/v1/object/public/equipamentos-media/69bf793b-eeab-4864-b632-78a6cd78c2bd/1780157829161-Imagens_Finalistas_2.png',
  'https://lykfbclxsyazerffcpta.supabase.co/storage/v1/object/public/equipamentos-media/69bf793b-eeab-4864-b632-78a6cd78c2bd/1780157826346-Imagens_FInalistas_1.png',
  'https://lykfbclxsyazerffcpta.supabase.co/storage/v1/object/public/equipamentos-media/69bf793b-eeab-4864-b632-78a6cd78c2bd/1780157834979-Imagens_Finalistas_4.png',
]

function exemplo(idioma: IdiomaFicha): FichaProdutoDados {
  return {
    idioma,
    marca: 'Candela', modelo: 'GentleLase Pro', ano: '2019',
    serialCompleto: 'GLP2019A4821', incluirSnCompleto: false,
    condicao: 'Recondicionado',
    condicaoDescricao: 'Equipamento totalmente testado e recondicionado pela nossa equipa técnica. Ecrã e handpieces funcionais; consumíveis revistos. Pronto a operar.',
    voltagem: '230 V', frequencia: '50/60 Hz', dimensoes: '110 × 45 × 90 cm', pesoKg: 95, softwareVersao: 'v4.2',
    handpieces: [
      { nome: 'Dual (18 mm / 10 mm)', contador_pulsos: 1250000, data_leitura: '2026-08-01' },
      { nome: 'DCD (arrefecimento)', contador_pulsos: 980000, data_leitura: '2026-08-01' },
    ],
    acessorios: ['Óculos de proteção', 'Pedal', 'Manual do utilizador', 'Cabo de alimentação'],
    preco: 42000, moeda: 'EUR', garantia: '6 meses', shippingTraining: true,
    fotos: FOTOS,
  }
}

export default function FichaPreviewPage() {
  const [idioma, setIdioma] = useState<IdiomaFicha>('pt')
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    let criado: string | null = null
    setUrl(null); setErro(null)
    gerarPdfFichaProduto(exemplo(idioma))
      .then((blob) => { if (!ativo) return; criado = URL.createObjectURL(blob); setUrl(criado) })
      .catch((e) => { if (ativo) setErro(e instanceof Error ? e.message : 'erro') })
    return () => { ativo = false; if (criado) URL.revokeObjectURL(criado) }
  }, [idioma])

  return (
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderBottom: '1px solid #eee' }}>
        <strong style={{ color: 'var(--primary)' }}>Pré-visualização da ficha (layout A) — dados de exemplo</strong>
        <select value={idioma} onChange={(e) => setIdioma(e.target.value as IdiomaFicha)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #ddd' }}>
          <option value="pt">Português</option><option value="en">English</option>
          <option value="es">Español</option><option value="fr">Français</option>
        </select>
      </div>
      {erro && <p style={{ padding: 16, color: '#B91C1C' }}>Erro: {erro}</p>}
      {url ? (
        <iframe src={url} title="Ficha de produto" style={{ flex: 1, width: '100%', border: 'none' }} />
      ) : !erro && <p style={{ padding: 16, color: 'var(--muted)' }}>A gerar…</p>}
    </main>
  )
}
