'use client'

import { useEffect, useState } from 'react'
import { usePortalCC } from '@/lib/portalCCAuth'
import { portalEquipamentos, formatarMoeda, formatarData, type PortalEquipamento } from '@/lib/portalCC'
import { Cartao, AtualizadoEm, Contacto, Vazio, ACarregar, Pill, tabelaEst } from '../_comps'

const COLS = '1.4fr 0.6fr 1fr 1fr 1fr 0.9fr'

export default function EquipamentosPage() {
  const { contaSelId, t } = usePortalCC()
  const [linhas, setLinhas] = useState<PortalEquipamento[] | null>(null)

  useEffect(() => {
    if (!contaSelId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinhas(null)
    portalEquipamentos(contaSelId).then(setLinhas)
  }, [contaSelId])

  return (
    <Cartao titulo={t('nav_equipment')}>
      <AtualizadoEm />
      {linhas === null ? <ACarregar /> : linhas.length === 0 ? <Vazio /> : (
        <div style={tabelaEst.tabela}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, minWidth: 640, ...tabelaEst.cab }}>
            <span style={tabelaEst.cel}>{t('col_model')}</span>
            <span style={tabelaEst.cel}>{t('col_year')}</span>
            <span style={tabelaEst.cel}>{t('col_serial')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{t('col_declared_cost')}</span>
            <span style={tabelaEst.cel}>{t('col_ship_date')}</span>
            <span style={{ ...tabelaEst.cel, textAlign: 'center' }}>{t('col_status')}</span>
          </div>
          {linhas.map((e) => (
            <div key={e.consignacao_id} style={{ display: 'grid', gridTemplateColumns: COLS, minWidth: 640, ...tabelaEst.linha }}>
              <span style={{ ...tabelaEst.cel, fontWeight: 600 }}>{e.modelo ?? '—'}</span>
              <span style={tabelaEst.cel}>{e.ano ?? '—'}</span>
              <span style={tabelaEst.cel}>{e.numero_serie ?? '—'}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'right' }}>{formatarMoeda(e.custo_declarado, e.moeda_custo)}</span>
              <span style={tabelaEst.cel}>{formatarData(e.data_envio)}</span>
              <span style={{ ...tabelaEst.cel, textAlign: 'center' }}><Pill estado={e.estado} /></span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}><Contacto /></div>
    </Cartao>
  )
}
