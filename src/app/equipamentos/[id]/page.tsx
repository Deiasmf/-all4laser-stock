'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { Equipamento } from '@/types/equipamento'
import { camposEmFalta, ROTULO_OBRIGATORIO } from '@/types/equipamento'
import MediaGaleria from '@/components/MediaGaleria'
import QrEquipamento from '@/components/QrEquipamento'
import styles from './detalhe.module.css'

function formatarData(d: string | null) {
  if (!d) return null
  const data = new Date(d)
  if (isNaN(data.getTime())) return d
  return data.toLocaleDateString('pt-PT')
}

function formatarEuro(v: number | null) {
  if (v === null || v === undefined) return null
  return v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

export default function DetalheEquipamento() {
  const params = useParams()
  const router = useRouter()
  const { isAdmin } = useAuth()
  const id = params.id as string

  const [eq, setEq] = useState<Equipamento | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aApagar, setAApagar] = useState(false)
  const [faturaUrl, setFaturaUrl] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('equipamentos')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setEq(data as Equipamento)
        setLoading(false)
      })
  }, [id])

  // Link temporário seguro para a fatura (bucket privado), só admins
  useEffect(() => {
    const caminho = eq?.fatura_compra_caminho
    if (isAdmin && caminho) {
      supabase.storage
        .from('faturas')
        .createSignedUrl(caminho, 3600)
        .then(({ data }) => setFaturaUrl(data?.signedUrl ?? null))
    } else {
      setFaturaUrl(null)
    }
  }, [eq?.fatura_compra_caminho, isAdmin])

  if (loading) return <main className={styles.page}><p className={styles.estado}>A carregar...</p></main>
  if (erro || !eq)
    return (
      <main className={styles.page}>
        <Link href="/" className={styles.voltar}>← Voltar à lista</Link>
        <p className={styles.estado}>Equipamento não encontrado.</p>
      </main>
    )

  async function apagar() {
    const nome = eq?.modelo || eq?.serial_number || 'este equipamento'
    const confirmado = window.confirm(
      `Tem a certeza que quer apagar "${nome}"?\n\nEsta ação não pode ser desfeita.`
    )
    if (!confirmado) return
    setAApagar(true)
    const { error } = await supabase.from('equipamentos').delete().eq('id', id)
    if (error) {
      setAApagar(false)
      alert('Erro ao apagar: ' + error.message)
    } else {
      router.push('/')
    }
  }

  const falta = camposEmFalta(eq)

  // Componente auxiliar para uma linha de campo
  const Linha = ({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) => (
    <div className={styles.linha}>
      <span className={styles.rotulo}>{rotulo}</span>
      <span className={styles.valor}>
        {valor === null || valor === undefined || valor === '' ? (
          <span className={styles.vazio}>em falta</span>
        ) : (
          valor
        )}
      </span>
    </div>
  )

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.voltar}>← Voltar à lista</Link>

      <div className={styles.header}>
        <span className={styles.titulo}>{eq.modelo ?? 'Sem modelo'}</span>
        {isAdmin && (
          <div className={styles.headerBotoes}>
            <Link href={`/equipamentos/${eq.id}/edit?saida=1`} className={styles.btnSaida}>
              Registar saída
            </Link>
            <Link href={`/equipamentos/${eq.id}/edit`} className={styles.btnEditar}>
              Editar
            </Link>
          </div>
        )}
      </div>
      <div className={styles.subtitulo}>
        Serial: {eq.serial_number ?? '—'}
      </div>

      {falta.length > 0 && (
        <div className={styles.aviso}>
          <strong>Informação em falta:</strong>{' '}
          {falta.map((c) => ROTULO_OBRIGATORIO[c] ?? c).join(', ')}
        </div>
      )}

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Identificação</div>
        <Linha rotulo="Modelo" valor={eq.modelo} />
        <Linha rotulo="Marca" valor={eq.marca} />
        <Linha rotulo="Serial Number" valor={eq.serial_number} />
        <Linha rotulo="Ano" valor={eq.ano} />
        <Linha
          rotulo="Status"
          valor={eq.status ? <span className={styles.statusTag}>{eq.status}</span> : null}
        />
        <Linha rotulo="Acessórios" valor={eq.acessorios} />
        {eq.modelo?.toLowerCase().replace(/\s/g, '').includes('pro-u') && (
          <Linha rotulo="Original/Upgraded" valor={eq.original_upgraded} />
        )}
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Movimento</div>
        <Linha rotulo="Origem" valor={eq.origem} />
        <Linha rotulo="Destino" valor={eq.destino} />
        <Linha rotulo="Data de entrada" valor={formatarData(eq.data_entrada)} />
        <Linha rotulo="Data de saída" valor={formatarData(eq.data_saida)} />
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Valores</div>
        <Linha rotulo="Valor de compra" valor={formatarEuro(eq.valor_compra)} />
        <Linha rotulo="Preço de venda" valor={formatarEuro(eq.preco_venda)} />
        <Linha rotulo="Rentabilização" valor={eq.rentabilizacao} />
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Documentos</div>
        <Linha rotulo="Fatura de compra" valor={eq.fatura_compra} />
        {isAdmin && (
          <Linha
            rotulo="Ficheiro da fatura"
            valor={
              faturaUrl ? (
                <a href={faturaUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  📄 Ver ficheiro
                </a>
              ) : eq.fatura_compra_caminho ? (
                'a preparar link...'
              ) : null
            }
          />
        )}
        <Linha rotulo="Fatura de saída" valor={eq.fatura_saida} />
        <Linha rotulo="AWB + DAU" valor={eq.awb_dau} />
        <Linha rotulo="Nota de encomenda" valor={eq.nota_encomenda} />
        <Linha rotulo="Relatório técnico" valor={eq.relatorio_tecnico} />
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Observações</div>
        <Linha rotulo="Observações" valor={eq.observacoes} />
      </div>

      {(eq.criado_por_nome || eq.saida_por_nome) && (
        <div className={styles.seccao}>
          <div className={styles.seccaoTitulo}>Registo</div>
          <Linha rotulo="Entrada registada por" valor={eq.criado_por_nome} />
          <Linha rotulo="Saída registada por" valor={eq.saida_por_nome} />
        </div>
      )}

      <QrEquipamento equipamentoId={eq.id} modelo={eq.modelo} marca={eq.marca} serial={eq.serial_number} />

      <MediaGaleria equipamentoId={eq.id} />

      {isAdmin && (
        <div className={styles.zonaApagar}>
          <button className={styles.btnApagar} onClick={apagar} disabled={aApagar}>
            {aApagar ? 'A apagar...' : 'Apagar equipamento'}
          </button>
        </div>
      )}
    </main>
  )
}
