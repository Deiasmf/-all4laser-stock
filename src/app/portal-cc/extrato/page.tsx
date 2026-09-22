'use client'

import { useEffect, useState } from 'react'
import { usePortalCC } from '@/lib/portalCCAuth'
import { portalExtrato, formatarMoeda, formatarData, type PortalMovimento } from '@/lib/portalCC'
import { Cartao, AtualizadoEm, Contacto, Vazio, ACarregar, tabelaEst } from '../_comps'

const COLS = '1fr 1.6fr 1fr 1fr 1fr'

export default function ExtratoPage() {
  const { contaSelId, t } = usePortalCC()
  const [linhas, setLinhas] = useState<PortalMovimento[] | null>(null)

  useEffect(() => {
    if (!contaSelId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinhas(null)
    portalExtrato(contaSelId).then(setLinhas)
  }, [contaSelId])

  // Mais recente primeiro para leitura; o saldo já vem acumulado da view.
  const ordenadas = linhas ? [...linhas].reverse() : null

  return (
    <Cartao titulo={t('nav_statement')}>
      <AtualizadoEm />
      {ordenadas === null ? <ACarregar /> : ordenadas.length === 0 ? <Vazio /> : (
        <div style={tabelaEst.tabela}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, minWidth: 620, ...tabelaEst.cab }}>
            <span style={tabelaEst.cel}>{t('col_date')}</span>
            <span style={tabelaEst.cel}>{t('col_description')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{t('col_expected')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{t('col_received')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{t('col_balance')}</span>
          </div>
          {ordenadas.map((m, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: COLS, minWidth: 620, ...tabelaEst.linha }}>
              <span style={tabelaEst.cel}>{formatarData(m.data)}</span>
              <span style={{ ...tabelaEst.cel, color: '#6b7280' }}>{m.descricao ?? '—'}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{m.esperado ? formatarMoeda(m.esperado, m.moeda) : '—'}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'right', color: '#065F46' }}>{m.recebido ? formatarMoeda(m.recebido, m.moeda) : '—'}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'right', fontWeight: 700 }}>{formatarMoeda(m.saldo, m.moeda)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}><Contacto /></div>
    </Cartao>
  )
}
