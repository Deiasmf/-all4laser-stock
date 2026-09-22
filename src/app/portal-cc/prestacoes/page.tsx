'use client'

import { useEffect, useState } from 'react'
import { usePortalCC } from '@/lib/portalCCAuth'
import { portalPrestacoes, formatarMoeda, formatarData, type PortalPrestacao } from '@/lib/portalCC'
import { Cartao, AtualizadoEm, Contacto, Vazio, ACarregar, Pill, tabelaEst } from '../_comps'

const COLS = '0.6fr 1.4fr 1fr 1fr 1fr 1fr'

export default function PrestacoesPage() {
  const { contaSelId, t } = usePortalCC()
  const [linhas, setLinhas] = useState<PortalPrestacao[] | null>(null)

  useEffect(() => {
    if (!contaSelId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinhas(null)
    portalPrestacoes(contaSelId).then(setLinhas)
  }, [contaSelId])

  return (
    <Cartao titulo={t('nav_installments')}>
      <AtualizadoEm />
      {linhas === null ? <ACarregar /> : linhas.length === 0 ? <Vazio /> : (
        <div style={tabelaEst.tabela}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, minWidth: 640, ...tabelaEst.cab }}>
            <span style={tabelaEst.cel}>{t('col_number')}</span>
            <span style={tabelaEst.cel}>{t('col_description')}</span>
            <span style={tabelaEst.cel}>{t('col_due')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{t('col_amount')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'center' }}>{t('col_status')}</span>
            <span style={tabelaEst.cel}>{t('col_payment')}</span>
          </div>
          {linhas.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: COLS, minWidth: 640, ...tabelaEst.linha }}>
              <span style={tabelaEst.cel}>{p.numero === 0 ? t('entry') : p.numero}</span>
              <span style={{ ...tabelaEst.cel, color: '#6b7280' }}>{p.descricao ?? '—'}</span>
              <span style={tabelaEst.cel}>{formatarData(p.data_vencimento)}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'right', fontWeight: 600 }}>{formatarMoeda(p.valor, p.moeda)}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'center' }}><Pill estado={p.estado} /></span>
              <span style={tabelaEst.cel}>{formatarData(p.data_pagamento)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}><Contacto /></div>
    </Cartao>
  )
}
