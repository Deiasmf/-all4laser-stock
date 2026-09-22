'use client'

import { useEffect, useState } from 'react'
import { usePortalCC } from '@/lib/portalCCAuth'
import { portalVendas, formatarMoeda, formatarData, type PortalVenda } from '@/lib/portalCC'
import { Cartao, AtualizadoEm, Contacto, Vazio, ACarregar, Pill, tabelaEst } from '../_comps'

const COLS = '1fr 1fr 1fr 1fr 1fr 1fr 0.9fr'

export default function VendasPage() {
  const { contaSelId, t } = usePortalCC()
  const [linhas, setLinhas] = useState<PortalVenda[] | null>(null)

  useEffect(() => {
    if (!contaSelId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinhas(null)
    portalVendas(contaSelId).then(setLinhas)
  }, [contaSelId])

  return (
    <Cartao titulo={t('nav_sales')}>
      <AtualizadoEm />
      {linhas === null ? <ACarregar /> : linhas.length === 0 ? <Vazio /> : (
        <div style={tabelaEst.tabela}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, minWidth: 760, ...tabelaEst.cab }}>
            <span style={tabelaEst.cel}>{t('col_date')}</span>
            <span style={tabelaEst.cel}>{t('col_serial')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{t('col_sale_price')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{t('col_cost')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{t('col_share')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{t('col_amount_due')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'center' }}>{t('col_payment')}</span>
          </div>
          {linhas.map((v, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: COLS, minWidth: 760, ...tabelaEst.linha }}>
              <span style={tabelaEst.cel}>{formatarData(v.data_venda)}</span>
              <span style={tabelaEst.cel}>{v.numero_serie ?? '—'}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{formatarMoeda(v.preco_venda, v.moeda_venda)}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{formatarMoeda(v.custo_convertido, v.moeda_venda)}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{formatarMoeda(v.partilha, v.moeda_venda)}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'right', fontWeight: 700 }}>{formatarMoeda(v.valor_devido, v.moeda_venda)}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'center' }}><Pill estado={v.estado} /></span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}><Contacto /></div>
    </Cartao>
  )
}
