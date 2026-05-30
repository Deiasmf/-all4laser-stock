'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import styles from './dashboard.module.css'

type Linha = {
  id: string
  marca: string | null
  modelo: string | null
  ano: string | null
  status: string | null
  data_entrada: string | null
  data_saida: string | null
  serial_number: string | null
  destino: string | null
}

// Mês corrente no formato AAAA-MM (ex: 2026-05)
const MES_ATUAL = new Date().toISOString().slice(0, 7)

const nomesMes = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const mesPorExtenso = `${nomesMes[new Date().getMonth()]} de ${new Date().getFullYear()}`

// Conta ocorrências agrupando por uma chave composta
function agrupar(linhas: Linha[], chave: (l: Linha) => string) {
  const mapa = new Map<string, number>()
  for (const l of linhas) {
    const k = chave(l)
    mapa.set(k, (mapa.get(k) ?? 0) + 1)
  }
  return mapa
}

export default function Dashboard() {
  const router = useRouter()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Carrega todos os registos (em páginas de 1000, limite do Supabase)
    async function carregar() {
      const todas: Linha[] = []
      let de = 0
      const TAM = 1000
      while (true) {
        const { data, error } = await supabase
          .from('equipamentos')
          .select('id, marca, modelo, ano, status, data_entrada, data_saida, serial_number, destino')
          .range(de, de + TAM - 1)
        if (error || !data || data.length === 0) break
        todas.push(...(data as Linha[]))
        if (data.length < TAM) break
        de += TAM
      }
      setLinhas(todas)
      setLoading(false)
    }
    carregar()
  }, [])

  if (loading)
    return (
      <main className={styles.page}>
        <Link href="/" className={styles.voltar}>← Voltar à lista</Link>
        <p className={styles.estado}>A carregar dados...</p>
      </main>
    )

  // --- Cálculos ---
  const entradasMes = linhas.filter((l) => l.data_entrada?.startsWith(MES_ATUAL))
  const saidasMes = linhas.filter((l) => l.data_saida?.startsWith(MES_ATUAL))
  const emStock = linhas.filter((l) => (l.status ?? '').toLowerCase().includes('stock'))
  const emAluguer = linhas
    .filter(
      (l) =>
        (l.status ?? '').trim().toLowerCase().startsWith('aluguer') &&
        (l.marca ?? '').toLowerCase() !== 'zimmer'
    )
    .sort(
      (a, b) =>
        (a.marca || '').localeCompare(b.marca || '', 'pt') ||
        (a.modelo || '').localeCompare(b.modelo || '', 'pt')
    )

  // --- Gráfico: entradas vs saídas nos últimos 12 meses ---
  const mesesGrafico: { chave: string; label: string; entradas: number; saidas: number }[] = []
  const hoje = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    mesesGrafico.push({
      chave,
      label: `${nomesMes[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`,
      entradas: linhas.filter((l) => l.data_entrada?.startsWith(chave)).length,
      saidas: linhas.filter((l) => l.data_saida?.startsWith(chave)).length,
    })
  }
  const maxBarra = Math.max(1, ...mesesGrafico.map((m) => Math.max(m.entradas, m.saidas)))

  // Tabela: modelo + ano -> contagem
  const tabelaModeloAno = (subset: Linha[]) => {
    const mapa = agrupar(subset, (l) => `${l.modelo || 'Sem modelo'}|||${l.ano || 'Sem ano'}`)
    return Array.from(mapa.entries())
      .map(([k, n]) => {
        const [modelo, ano] = k.split('|||')
        return { modelo, ano, n }
      })
      .sort((a, b) => a.modelo.localeCompare(b.modelo, 'pt') || a.ano.localeCompare(b.ano))
  }

  // Tabela stock: marca -> modelo + ano -> contagem (agrupado por marca)
  const stockMapa = agrupar(
    emStock,
    (l) => `${l.marca || 'Sem marca'}|||${l.modelo || 'Sem modelo'}|||${l.ano || 'Sem ano'}`
  )
  const stockLista = Array.from(stockMapa.entries())
    .map(([k, n]) => {
      const [marca, modelo, ano] = k.split('|||')
      return { marca, modelo, ano, n }
    })
    .sort(
      (a, b) =>
        a.marca.localeCompare(b.marca, 'pt') ||
        a.modelo.localeCompare(b.modelo, 'pt') ||
        a.ano.localeCompare(b.ano)
    )

  const entradasTab = tabelaModeloAno(entradasMes)
  const saidasTab = tabelaModeloAno(saidasMes)

  // Render de uma tabela modelo/ano
  const TabelaModeloAno = ({ dados }: { dados: { modelo: string; ano: string; n: number }[] }) =>
    dados.length === 0 ? (
      <p className={styles.vazio}>Nenhum registo este mês.</p>
    ) : (
      <table className={styles.tabela}>
        <thead>
          <tr>
            <th>Modelo</th>
            <th>Ano</th>
            <th className={styles.num}>Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((d) => (
            <tr key={`${d.modelo}-${d.ano}`}>
              <td>{d.modelo}</td>
              <td>{d.ano}</td>
              <td className={styles.num}>{d.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )

  // Render da tabela de stock agrupada por marca
  function tabelaStock() {
    let ultimaMarca: string | null = null
    const out: React.ReactElement[] = []
    for (const d of stockLista) {
      if (d.marca !== ultimaMarca) {
        out.push(
          <tr key={`m-${d.marca}`} className={styles.grupoMarca}>
            <td colSpan={3}>{d.marca}</td>
          </tr>
        )
        ultimaMarca = d.marca
      }
      out.push(
        <tr key={`${d.marca}-${d.modelo}-${d.ano}`}>
          <td>{d.modelo}</td>
          <td>{d.ano}</td>
          <td className={styles.num}>{d.n}</td>
        </tr>
      )
    }
    return out
  }

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.voltar}>← Voltar à lista</Link>
      <div className={styles.titulo}>Dashboard</div>
      <div className={styles.subtitulo}>Resumo do stock · mês corrente: {mesPorExtenso}</div>

      <div className={styles.resumo}>
        <div className={styles.kpi}>
          <div className={styles.kpiNumero}>{linhas.length}</div>
          <div className={styles.kpiRotulo}>Total de equipamentos</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiNumero}>{emStock.length}</div>
          <div className={styles.kpiRotulo}>Em stock</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiNumero}>{emAluguer.length}</div>
          <div className={styles.kpiRotulo}>Em aluguer</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiNumero}>{entradasMes.length}</div>
          <div className={styles.kpiRotulo}>Entradas este mês</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiNumero}>{saidasMes.length}</div>
          <div className={styles.kpiRotulo}>Saídas este mês</div>
        </div>
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Entradas vs Saídas (últimos 12 meses)</div>
        <div className={styles.legenda}>
          <span className={styles.legendaItem}>
            <span className={`${styles.legendaCor} ${styles.corEntrada}`} /> Entradas
          </span>
          <span className={styles.legendaItem}>
            <span className={`${styles.legendaCor} ${styles.corSaida}`} /> Saídas
          </span>
        </div>
        <div className={styles.grafico}>
          {mesesGrafico.map((m) => (
            <div key={m.chave} className={styles.mesCol}>
              <div className={styles.barras}>
                <div
                  className={`${styles.barra} ${styles.corEntrada}`}
                  style={{ height: `${(m.entradas / maxBarra) * 100}%` }}
                >
                  {m.entradas > 0 && <span className={styles.barraValor}>{m.entradas}</span>}
                </div>
                <div
                  className={`${styles.barra} ${styles.corSaida}`}
                  style={{ height: `${(m.saidas / maxBarra) * 100}%` }}
                >
                  {m.saidas > 0 && <span className={styles.barraValor}>{m.saidas}</span>}
                </div>
              </div>
              <div className={styles.mesLabel}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Equipamentos em aluguer ({emAluguer.length})</div>
        {emAluguer.length === 0 ? (
          <p className={styles.vazio}>Nenhum equipamento em aluguer.</p>
        ) : (
          <table className={styles.tabela}>
            <thead>
              <tr>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Serial</th>
                <th>Destino</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {emAluguer.map((l) => (
                <tr
                  key={l.id}
                  className={styles.linhaClicavel}
                  onClick={() => router.push(`/equipamentos/${l.id}`)}
                >
                  <td>{l.marca ?? '—'}</td>
                  <td>{l.modelo ?? '—'}</td>
                  <td>{l.serial_number ?? '—'}</td>
                  <td>{l.destino ?? '—'}</td>
                  <td>{l.status ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Entradas no mês corrente (por modelo e ano)</div>
        <TabelaModeloAno dados={entradasTab} />
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Saídas no mês corrente (por modelo e ano)</div>
        <TabelaModeloAno dados={saidasTab} />
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Em stock (por marca, modelo e ano)</div>
        {stockLista.length === 0 ? (
          <p className={styles.vazio}>Nenhum equipamento em stock.</p>
        ) : (
          <table className={styles.tabela}>
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Ano</th>
                <th className={styles.num}>Quantidade</th>
              </tr>
            </thead>
            <tbody>{tabelaStock()}</tbody>
          </table>
        )}
      </div>
    </main>
  )
}
