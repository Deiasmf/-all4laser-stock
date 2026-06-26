'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePortalAuth } from '@/lib/portalAuth'
import {
  MODELOS_RESERVA, MODALIDADES, type Modalidade,
  calcularDataFim, dataMinimaInicio, modalidadeLabel, formatarData, criarReserva,
} from '@/lib/reservasPortal'
import s from '../portal.module.css'

export default function NovaReservaPage() {
  const router = useRouter()
  const { cliente, session } = usePortalAuth()

  const [passo, setPasso] = useState<1 | 2 | 3>(1)
  const [modelo, setModelo] = useState<string>(MODELOS_RESERVA[0])
  const [modalidade, setModalidade] = useState<Modalidade>('1_dia')
  const [dataInicio, setDataInicio] = useState('')
  const [notas, setNotas] = useState('')
  const [aProcessar, setAProcessar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const minimo = useMemo(() => dataMinimaInicio(), [])
  const dataFim = useMemo(
    () => (dataInicio ? calcularDataFim(dataInicio, modalidade) : ''),
    [dataInicio, modalidade],
  )

  function avancarDatas() {
    setErro(null)
    if (!dataInicio) { setErro('Escolhe a data de início.'); return }
    if (dataInicio < minimo) {
      setErro('As reservas requerem pelo menos 1 semana de antecedência.')
      return
    }
    setPasso(3)
  }

  async function submeter() {
    if (!session || !cliente) { setErro('Sessão expirada. Inicia sessão novamente.'); return }
    setErro(null)
    setAProcessar(true)
    const r = await criarReserva({
      cliente_portal_id: cliente.id,
      cliente_nome: cliente.nome,
      cliente_email: cliente.email,
      cliente_telefone: cliente.telefone,
      modelo_equipamento: modelo,
      modalidade,
      data_inicio_pretendida: dataInicio,
      data_fim_pretendida: dataFim,
      notas_cliente: notas.trim() || null,
    })
    setAProcessar(false)
    if (!r.ok) { setErro(r.erro ?? 'Não foi possível submeter o pedido.'); return }
    router.replace(`/reservas/${r.id}?novo=1`)
  }

  return (
    <div className={s.cartao}>
      <div className={s.passos}>
        <div className={`${s.passo} ${passo === 1 ? s.passoAtivo : ''}`}>1 · Equipamento</div>
        <div className={`${s.passo} ${passo === 2 ? s.passoAtivo : ''}`}>2 · Datas</div>
        <div className={`${s.passo} ${passo === 3 ? s.passoAtivo : ''}`}>3 · Confirmar</div>
      </div>

      {erro && <div className={s.erro}>{erro}</div>}

      {/* PASSO 1 — Equipamento */}
      {passo === 1 && (
        <>
          <div className={s.campo}>
            <label className={s.label}>Modelo de equipamento</label>
            <select className={s.select} value={modelo} onChange={(e) => setModelo(e.target.value)}>
              {MODELOS_RESERVA.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className={s.campo}>
            <label className={s.label}>Modalidade</label>
            <select className={s.select} value={modalidade} onChange={(e) => setModalidade(e.target.value as Modalidade)}>
              {MODALIDADES.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
            </select>
          </div>
          <div className={s.acoes}>
            <button className={s.botao} onClick={() => { setErro(null); setPasso(2) }}>Continuar</button>
          </div>
        </>
      )}

      {/* PASSO 2 — Datas */}
      {passo === 2 && (
        <>
          <div className={s.aviso}>
            As reservas estão sujeitas a disponibilidade e requerem validação com pelo menos 1 semana de antecedência.
          </div>
          <div className={s.campo}>
            <label className={s.label}>Data de início pretendida</label>
            <input className={s.input} type="date" min={minimo} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div className={s.campo}>
            <label className={s.label}>Data de fim (calculada)</label>
            <input className={s.input} type="text" value={dataFim ? formatarData(dataFim) : '—'} readOnly disabled />
          </div>
          <div className={s.acoes}>
            <button className={s.botaoSec} onClick={() => { setErro(null); setPasso(1) }}>Voltar</button>
            <button className={s.botao} onClick={avancarDatas}>Continuar</button>
          </div>
        </>
      )}

      {/* PASSO 3 — Confirmação */}
      {passo === 3 && (
        <>
          <div className={s.resumoLinha}><span className={s.resumoLabel}>Modelo</span><span className={s.resumoValor}>{modelo}</span></div>
          <div className={s.resumoLinha}><span className={s.resumoLabel}>Modalidade</span><span className={s.resumoValor}>{modalidadeLabel(modalidade)}</span></div>
          <div className={s.resumoLinha}><span className={s.resumoLabel}>Início</span><span className={s.resumoValor}>{formatarData(dataInicio)}</span></div>
          <div className={s.resumoLinha}><span className={s.resumoLabel}>Fim</span><span className={s.resumoValor}>{formatarData(dataFim)}</span></div>
          <div className={s.campo} style={{ marginTop: 16 }}>
            <label className={s.label}>Notas (opcional)</label>
            <textarea className={s.textarea} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Algo que devamos saber sobre este pedido?" />
          </div>
          <div className={s.acoes}>
            <button className={s.botaoSec} onClick={() => { setErro(null); setPasso(2) }} disabled={aProcessar}>Voltar</button>
            <button className={s.botao} onClick={submeter} disabled={aProcessar}>{aProcessar ? 'A submeter...' : 'Submeter pedido'}</button>
          </div>
        </>
      )}
    </div>
  )
}
