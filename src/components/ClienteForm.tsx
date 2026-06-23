'use client'

import { useState } from 'react'
import { TIPO_CLIENTE_OPCOES, type Cliente, type ClienteInput, type TipoCliente } from '@/types/cliente'

type Props = {
  inicial?: Cliente
  aGuardar: boolean
  erro: string | null
  submitLabel: string
  onSubmit: (input: ClienteInput) => void
}

export default function ClienteForm({ inicial, aGuardar, erro, submitLabel, onSubmit }: Props) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [pais, setPais] = useState(inicial?.pais ?? 'Portugal')
  const [email, setEmail] = useState(inicial?.email ?? '')
  const [telefone, setTelefone] = useState(inicial?.telefone ?? '')
  const [contactoNome, setContactoNome] = useState(inicial?.contacto_nome ?? '')
  const [nif, setNif] = useState(inicial?.nif ?? '')
  const [morada, setMorada] = useState(inicial?.morada ?? '')
  const [cidade, setCidade] = useState(inicial?.cidade ?? '')
  const [codigoPostal, setCodigoPostal] = useState(inicial?.codigo_postal ?? '')
  const [tipo, setTipo] = useState<TipoCliente | ''>(inicial?.tipo ?? '')
  const [observacoes, setObservacoes] = useState(inicial?.observacoes ?? '')
  const [avisoNome, setAvisoNome] = useState(false)
  const [avisoEmail, setAvisoEmail] = useState(false)

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setAvisoNome(true); return }
    if (email.trim() && !email.includes('@')) { setAvisoEmail(true); return }
    onSubmit({
      nome, pais, email, telefone, contacto_nome: contactoNome, nif,
      morada, cidade, codigo_postal: codigoPostal,
      tipo: tipo || null, observacoes,
    })
  }

  return (
    <form onSubmit={submeter} className="a4l-card" style={s.form}>
      <Grupo titulo="Identificação">
        <Campo label="Nome *">
          <input
            value={nome}
            onChange={(e) => { setNome(e.target.value); setAvisoNome(false) }}
            placeholder="Nome do cliente / clínica"
            style={{ ...s.input, ...(avisoNome ? s.inputErro : {}) }}
          />
          {avisoNome && <span style={s.aviso}>O nome é obrigatório.</span>}
        </Campo>
        <Linha>
          <Campo label="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCliente | '')} style={s.input}>
              <option value="">—</option>
              {TIPO_CLIENTE_OPCOES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="País">
            <input value={pais} onChange={(e) => setPais(e.target.value)} placeholder="Portugal" style={s.input} />
          </Campo>
        </Linha>
      </Grupo>

      <Grupo titulo="Contacto">
        <Linha>
          <Campo label="Email (para faturação)">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setAvisoEmail(false) }}
              placeholder="cliente@exemplo.com"
              style={{ ...s.input, ...(avisoEmail ? s.inputErro : {}) }}
            />
            {avisoEmail && <span style={s.aviso}>Email inválido.</span>}
          </Campo>
          <Campo label="Telefone">
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="+351 ..." style={s.input} />
          </Campo>
        </Linha>
        <Campo label="Pessoa de contacto">
          <input value={contactoNome} onChange={(e) => setContactoNome(e.target.value)} placeholder="Nome de quem contactas" style={s.input} />
        </Campo>
      </Grupo>

      <Grupo titulo="Morada e faturação">
        <Campo label="NIF">
          <input value={nif} onChange={(e) => setNif(e.target.value)} style={s.input} />
        </Campo>
        <Campo label="Morada">
          <input value={morada} onChange={(e) => setMorada(e.target.value)} style={s.input} />
        </Campo>
        <Linha>
          <Campo label="Código-postal">
            <input value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} style={s.input} />
          </Campo>
          <Campo label="Cidade">
            <input value={cidade} onChange={(e) => setCidade(e.target.value)} style={s.input} />
          </Campo>
        </Linha>
      </Grupo>

      <Grupo titulo="Notas internas">
        <Campo label="Observações">
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} style={{ ...s.input, resize: 'vertical' }} />
        </Campo>
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
  input: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit', width: '100%' },
  inputErro: { borderColor: 'var(--danger)' },
  aviso: { fontSize: 12, color: 'var(--danger)' },
  erro: { background: '#fbecea', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600 },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 18px', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' },
  btnOff: { opacity: 0.6, cursor: 'default' },
}
