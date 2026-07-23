'use client'

import { useRef, useState } from 'react'
import { useFormDraft, RascunhoAviso } from '@/lib/useFormDraft'
import { fornecedorParaInput, fornecedorVazio } from '@/lib/fornecedores'
import type { Fornecedor, FornecedorInput } from '@/types/compras'

type Props = {
  inicial?: Fornecedor
  aGuardar: boolean
  erro: string | null
  submitLabel: string
  onSubmit: (input: FornecedorInput) => void
  // Quando definido, ativa o rascunho automático sob draft:<rascunhoKey>.
  rascunhoKey?: string
}

export default function FornecedorForm({ inicial, aGuardar, erro, submitLabel, onSubmit, rascunhoKey }: Props) {
  const [form, setForm] = useState<FornecedorInput>(() => (inicial ? fornecedorParaInput(inicial) : fornecedorVazio()))
  const [avisoNome, setAvisoNome] = useState(false)
  const set = <K extends keyof FornecedorInput>(k: K, v: FornecedorInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  // Base = estado inicial (vazio em "novo", valores da BD em edição).
  const baseline = useRef(form).current
  const { rascunhoRecuperado, descartar } = useFormDraft<FornecedorInput>(
    rascunhoKey ?? 'fornecedor:novo', form, setForm,
    { enabled: !!rascunhoKey, emptyState: baseline }
  )

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) { setAvisoNome(true); return }
    onSubmit(form)
  }

  return (
    <form onSubmit={submeter} className="a4l-card" style={s.form}>
      {rascunhoRecuperado && <RascunhoAviso onDescartar={descartar} />}

      <Grupo titulo="Identificação">
        <Campo label="Nome *">
          <input
            value={form.nome}
            onChange={(e) => { set('nome', e.target.value); setAvisoNome(false) }}
            placeholder="Nome do fornecedor"
            style={{ ...s.input, ...(avisoNome ? s.inputErro : {}) }}
          />
          {avisoNome && <span style={s.aviso}>O nome é obrigatório.</span>}
        </Campo>
        <Linha>
          <Campo label="NIF / VAT">
            <input value={form.nif ?? ''} onChange={(e) => set('nif', e.target.value)} style={s.input} />
          </Campo>
          <Campo label="Pessoa de contacto">
            <input value={form.pessoa_contacto ?? ''} onChange={(e) => set('pessoa_contacto', e.target.value)} style={s.input} />
          </Campo>
        </Linha>
      </Grupo>

      <Grupo titulo="Morada">
        <Campo label="Morada">
          <input value={form.morada ?? ''} onChange={(e) => set('morada', e.target.value)} style={s.input} />
        </Campo>
        <Linha>
          <Campo label="Código-postal">
            <input value={form.codigo_postal ?? ''} onChange={(e) => set('codigo_postal', e.target.value)} style={s.input} />
          </Campo>
          <Campo label="Localidade">
            <input value={form.localidade ?? ''} onChange={(e) => set('localidade', e.target.value)} style={s.input} />
          </Campo>
          <Campo label="País">
            <input value={form.pais ?? ''} onChange={(e) => set('pais', e.target.value)} placeholder="Portugal" style={s.input} />
          </Campo>
        </Linha>
      </Grupo>

      <Grupo titulo="Contactos">
        <Linha>
          <Campo label="Telefone">
            <input value={form.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} placeholder="+351 ..." style={s.input} />
          </Campo>
          <Campo label="Telemóvel">
            <input value={form.telemovel ?? ''} onChange={(e) => set('telemovel', e.target.value)} placeholder="+351 ..." style={s.input} />
          </Campo>
        </Linha>
        <Linha>
          <Campo label="Email geral">
            <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="geral@fornecedor.com" style={s.input} />
          </Campo>
          <Campo label="Email de reparações">
            <input type="email" value={form.email_reparacoes ?? ''} onChange={(e) => set('email_reparacoes', e.target.value)} placeholder="reparacoes@fornecedor.com" style={s.input} />
          </Campo>
        </Linha>
      </Grupo>

      <Grupo titulo="Financeiro">
        <Campo label="IBAN (opcional)">
          <input value={form.iban ?? ''} onChange={(e) => set('iban', e.target.value)} placeholder="PT50 ..." style={s.input} />
        </Campo>
      </Grupo>

      <Grupo titulo="Outros">
        <Campo label="Notas">
          <textarea value={form.notas ?? ''} onChange={(e) => set('notas', e.target.value)} rows={3} style={{ ...s.input, resize: 'vertical' }} />
        </Campo>
        <label style={s.checkLinha}>
          <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} />
          <span>Fornecedor ativo</span>
        </label>
      </Grupo>

      {erro && <div style={s.erro}>{erro}</div>}

      <button type="submit" disabled={aGuardar} style={{ ...s.btn, ...(aGuardar ? s.btnOff : {}) }}>
        {aGuardar ? 'A guardar...' : submitLabel}
      </button>
    </form>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={s.grupo}>
      <div style={s.grupoTitulo}>{titulo}</div>
      {children}
    </section>
  )
}
function Linha({ children }: { children: React.ReactNode }) {
  return <div style={s.linha}>{children}</div>
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={s.campo}>
      <span style={s.label}>{label}</span>
      {children}
    </label>
  )
}

const s: Record<string, React.CSSProperties> = {
  form: { display: 'flex', flexDirection: 'column', gap: 20, padding: 20 },
  grupo: { display: 'flex', flexDirection: 'column', gap: 12 },
  grupoTitulo: { fontSize: 13, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.4 },
  linha: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  campo: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 },
  label: { fontSize: 13, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit', width: '100%', boxSizing: 'border-box' },
  inputErro: { borderColor: 'var(--danger)' },
  aviso: { fontSize: 12, color: 'var(--danger)' },
  checkLinha: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  erro: { background: '#fbecea', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600 },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 18px', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' },
  btnOff: { opacity: 0.6, cursor: 'default' },
}
