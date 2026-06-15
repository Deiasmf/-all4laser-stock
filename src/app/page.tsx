'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { Equipamento } from '@/types/equipamento'
import { camposEmFalta } from '@/types/equipamento'
import FiltroMulti from '@/components/FiltroMulti'
import styles from './page.module.css'

const TAMANHO_LOTE = 1000 // o Supabase devolve no máximo 1000 por pedido

function formatarEuro(v: number | null) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

// Lista ordenada de valores distintos de um campo
function distintos(lista: Equipamento[], campo: keyof Equipamento) {
  return Array.from(
    new Set(lista.map((e) => e[campo] as string).filter(Boolean))
  )
}

export default function Home() {
  const router = useRouter()
  const { isAdmin } = useAuth()

  const [todos, setTodos] = useState<Equipamento[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Filtros (todos combináveis). Os dropdowns aceitam várias opções (multi-seleção).
  const [pesquisa, setPesquisa] = useState('')
  const [marca, setMarca] = useState<string[]>([])
  const [modelo, setModelo] = useState<string[]>([])
  const [ano, setAno] = useState<string[]>([])
  const [status, setStatus] = useState<string[]>([])
  const [origem, setOrigem] = useState<string[]>([])
  const [destino, setDestino] = useState<string[]>([])
  const [soIncompletos, setSoIncompletos] = useState(false)

  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set())

  function alternarMarca(m: string) {
    setRecolhidas((atual) => {
      const nova = new Set(atual)
      if (nova.has(m)) nova.delete(m)
      else nova.add(m)
      return nova
    })
  }

  // Carregar TODOS os equipamentos uma vez (em lotes de 1000)
  useEffect(() => {
    async function carregar() {
      setLoading(true)
      setErro(null)
      const acumulado: Equipamento[] = []
      let de = 0
      let erroMsg: string | null = null
      while (true) {
        const { data, error } = await supabase
          .from('equipamentos')
          .select('*')
          .order('marca', { ascending: true, nullsFirst: false })
          .order('modelo', { ascending: true })
          .order('serial_number', { ascending: true })
          .range(de, de + TAMANHO_LOTE - 1)
        if (error) {
          erroMsg = error.message
          break
        }
        if (!data || data.length === 0) break
        acumulado.push(...(data as Equipamento[]))
        if (data.length < TAMANHO_LOTE) break
        de += TAMANHO_LOTE
      }
      if (erroMsg) setErro(erroMsg)
      else setTodos(acumulado)
      setLoading(false)
    }
    carregar()
  }, [])

  // Opções dos dropdowns (a partir dos dados carregados)
  const opcoes = useMemo(() => {
    return {
      marcas: distintos(todos, 'marca').sort((a, b) => a.localeCompare(b, 'pt')),
      // Modelos: se houver marca(s) escolhida(s), só os dessas marcas
      modelos: distintos(
        marca.length ? todos.filter((e) => marca.includes(e.marca as string)) : todos,
        'modelo'
      ).sort((a, b) => a.localeCompare(b, 'pt')),
      anos: distintos(todos, 'ano').sort((a, b) => b.localeCompare(a)),
      status: distintos(todos, 'status').sort((a, b) => a.localeCompare(b, 'pt')),
      origens: distintos(todos, 'origem').sort((a, b) => a.localeCompare(b, 'pt')),
      destinos: distintos(todos, 'destino').sort((a, b) => a.localeCompare(b, 'pt')),
    }
  }, [todos, marca])

  // Aplica todos os filtros (combinados com E; dentro de cada filtro é OU)
  const equipamentos = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    const incluido = (sel: string[], valor: string | null) =>
      sel.length === 0 || (valor != null && sel.includes(valor))
    return todos.filter((e) => {
      if (!incluido(marca, e.marca)) return false
      if (!incluido(modelo, e.modelo)) return false
      if (!incluido(ano, e.ano)) return false
      if (!incluido(status, e.status)) return false
      if (!incluido(origem, e.origem)) return false
      if (!incluido(destino, e.destino)) return false
      if (soIncompletos && camposEmFalta(e).length === 0) return false
      if (q) {
        const alvo = `${e.marca ?? ''} ${e.modelo ?? ''} ${e.serial_number ?? ''} ${e.destino ?? ''}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      return true
    })
  }, [todos, pesquisa, marca, modelo, ano, status, origem, destino, soIncompletos])

  const totalIncompletos = useMemo(
    () => todos.filter((e) => camposEmFalta(e).length > 0).length,
    [todos]
  )

  // Se mudarem as marcas, remove os modelos escolhidos que já não pertencem às marcas
  function mudarMarca(novasMarcas: string[]) {
    setMarca(novasMarcas)
    const modelosValidos = new Set(
      distintos(
        novasMarcas.length ? todos.filter((e) => novasMarcas.includes(e.marca as string)) : todos,
        'modelo'
      )
    )
    setModelo((atual) => atual.filter((m) => modelosValidos.has(m)))
  }

  function limparFiltros() {
    setPesquisa('')
    setMarca([])
    setModelo([])
    setAno([])
    setStatus([])
    setOrigem([])
    setDestino([])
    setSoIncompletos(false)
  }

  const temFiltros =
    !!pesquisa ||
    marca.length > 0 ||
    modelo.length > 0 ||
    ano.length > 0 ||
    status.length > 0 ||
    origem.length > 0 ||
    destino.length > 0 ||
    soIncompletos

  // Constrói linhas da tabela com cabeçalhos de grupo (Marca → Modelo)
  function linhasTabela() {
    let ultimaMarca: string | null = null
    let ultimoModelo: string | null = null
    const linhas: React.ReactElement[] = []

    for (const e of equipamentos) {
      const m = e.marca || 'Sem marca'
      const mod = e.modelo || 'Sem modelo'

      if (m !== ultimaMarca) {
        const recolhida = recolhidas.has(m)
        linhas.push(
          <tr key={`marca-${m}`} className={styles.grupoMarca} onClick={() => alternarMarca(m)}>
            <td colSpan={5}>
              <span className={styles.seta}>{recolhida ? '▸' : '▾'}</span>
              {m}
            </td>
          </tr>
        )
        ultimaMarca = m
        ultimoModelo = null
      }

      if (recolhidas.has(m)) continue

      if (mod !== ultimoModelo) {
        linhas.push(
          <tr key={`modelo-${m}-${mod}`} className={styles.grupoModelo}>
            <td colSpan={5}>{mod}</td>
          </tr>
        )
        ultimoModelo = mod
      }

      const falta = camposEmFalta(e)
      linhas.push(
        <tr key={e.id} className={styles.linhaEquip} onClick={() => router.push(`/equipamentos/${e.id}`)}>
          <td className={styles.serialCell}>{e.serial_number ?? '—'}</td>
          <td>{e.ano ?? '—'}</td>
          <td>{e.status ? <span className={styles.statusTag}>{e.status}</span> : '—'}</td>
          <td>{formatarEuro(e.valor_compra)}</td>
          <td>{falta.length > 0 && <span className={styles.badgeFalta}>{falta.length} em falta</span>}</td>
        </tr>
      )
    }
    return linhas
  }

  // Constrói cartões (telemóvel) com cabeçalhos de grupo
  function cartoes() {
    let ultimaMarca: string | null = null
    let ultimoModelo: string | null = null
    const itens: React.ReactElement[] = []

    for (const e of equipamentos) {
      const m = e.marca || 'Sem marca'
      const mod = e.modelo || 'Sem modelo'

      if (m !== ultimaMarca) {
        const recolhida = recolhidas.has(m)
        itens.push(
          <div key={`marca-${m}`} className={styles.cardGrupoMarca} onClick={() => alternarMarca(m)}>
            <span className={styles.seta}>{recolhida ? '▸' : '▾'}</span>
            {m}
          </div>
        )
        ultimaMarca = m
        ultimoModelo = null
      }

      if (recolhidas.has(m)) continue

      if (mod !== ultimoModelo) {
        itens.push(<div key={`modelo-${m}-${mod}`} className={styles.cardGrupoModelo}>{mod}</div>)
        ultimoModelo = mod
      }

      const falta = camposEmFalta(e)
      itens.push(
        <div key={e.id} className={styles.card} onClick={() => router.push(`/equipamentos/${e.id}`)}>
          <div className={styles.cardTop}>
            <span className={styles.cardModelo}>Serial: {e.serial_number ?? '— sem serial'}</span>
            {falta.length > 0 && <span className={styles.badgeFalta}>{falta.length} em falta</span>}
          </div>
          <div className={styles.cardLinha}>
            {e.status ? <span className={styles.statusTag}>{e.status}</span> : 'Sem status'}
            {e.ano ? ` · ${e.ano}` : ''}
          </div>
          <div className={styles.cardLinha}>Compra: {formatarEuro(e.valor_compra)}</div>
        </div>
      )
    }
    return itens
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <span className={styles.title}>Stock de equipamentos</span>
        <div className={styles.headerDireita}>
          <Link href="/dashboard" className={styles.btnSecundario}>Dashboard</Link>
          <span className={styles.count}>{equipamentos.length} de {todos.length}</span>
          {isAdmin && (
            <Link href="/equipamentos/novo" className={styles.btnAdicionar}>
              + Adicionar
            </Link>
          )}
        </div>
      </div>

      {totalIncompletos > 0 && !soIncompletos && (
        <button className={styles.alertaIncompletos} onClick={() => setSoIncompletos(true)}>
          ⚠ {totalIncompletos} equipamentos com informação em falta — clica para ver
        </button>
      )}

      <div className={styles.filtros}>
        <input
          className={styles.input}
          placeholder="Pesquisar por marca, modelo, serial ou destino..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
        />
        <FiltroMulti label="Marcas" opcoes={opcoes.marcas} selecionados={marca} onChange={mudarMarca} />
        <FiltroMulti label="Modelos" opcoes={opcoes.modelos} selecionados={modelo} onChange={setModelo} />
        <FiltroMulti label="Anos" opcoes={opcoes.anos} selecionados={ano} onChange={setAno} />
        <FiltroMulti label="Status" opcoes={opcoes.status} selecionados={status} onChange={setStatus} />
        <FiltroMulti label="Origens" opcoes={opcoes.origens} selecionados={origem} onChange={setOrigem} />
        <FiltroMulti label="Destinos" opcoes={opcoes.destinos} selecionados={destino} onChange={setDestino} />
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={soIncompletos}
            onChange={(e) => setSoIncompletos(e.target.checked)}
          />
          Só incompletos
        </label>
        {temFiltros && (
          <button className={styles.btnLimpar} onClick={limparFiltros}>
            Limpar filtros
          </button>
        )}
      </div>

      {erro && <p className={styles.estado} style={{ color: 'var(--danger)' }}>Erro: {erro}</p>}

      {loading ? (
        <p className={styles.estado}>A carregar...</p>
      ) : equipamentos.length === 0 ? (
        <p className={styles.estado}>Nenhum equipamento encontrado.</p>
      ) : (
        <>
          <div className={styles.tabelaWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Serial Number</th>
                  <th>Ano</th>
                  <th>Status</th>
                  <th>Preço de compra</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>{linhasTabela()}</tbody>
            </table>
          </div>

          <div className={styles.cards}>{cartoes()}</div>
        </>
      )}
    </main>
  )
}
