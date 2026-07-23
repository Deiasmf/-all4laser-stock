'use client'

import { useRef, useState } from 'react'
import { TIPO_CLIENTE_OPCOES, type Cliente, type ClienteInput, type TipoCliente } from '@/types/cliente'
import { useFormDraft, RascunhoAviso } from '@/lib/useFormDraft'

type Props = {
  inicial?: Cliente
  aGuardar: boolean
  erro: string | null
  submitLabel: string
  onSubmit: (input: ClienteInput) => void
  // Quando definido, ativa o rascunho automático sob a chave draft:<rascunhoKey>.
  // (Usar só em modo "novo"; em edição não convém restaurar por cima da BD.)
  rascunhoKey?: string
}

type FormState = {
  nome: string
  pais: string
  email: string
  telefone: string
  contactoNome: string
  nif: string
  morada: string
  cidade: string
  codigoPostal: string
  tipo: TipoCliente | ''
  observacoes: string
}

function estadoInicial(inicial?: Cliente): FormState {
  return {
    nome: inicial?.nome ?? '',
    pais: inicial?.pais ?? 'Portugal',
    email: inicial?.email ?? '',
    telefone: inicial?.telefone ?? '',
    contactoNome: inicial?.contacto_nome ?? '',
    nif: inicial?.nif ?? '',
    morada: inicial?.morada ?? '',
    cidade: inicial?.cidade ?? '',
    codigoPostal: inicial?.codigo_postal ?? '',
    tipo: inicial?.tipo ?? '',
    observacoes: inicial?.observacoes ?? '',
  }
}

export default function ClienteForm({ inicial, aGuardar, erro, submitLabel, onSubmit, rascunhoKey }: Props) {
  const [form, setForm] = useState<FormState>(() => estadoInicial(inicial))
  const [avisoNome, setAvisoNome] = useState(false)
  const [avisoEmail, setAvisoEmail] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  // Base = estado inicial (vazio em "novo", valores da BD em edição). Serve para
  // não gravar rascunho sem alterações e para o "Descartar" repor o inicial.
  const baseline = useRef(form).current
  const { rascunhoRecuperado, descartar } = useFormDraft<FormState>(
    rascunhoKey ?? 'cliente:novo',
    form,
    setForm,
    { enabled: !!rascunhoKey, emptyState: baseline }
  )

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) { setAvisoNome(true); return }
    if (form.email.trim() && !form.email.includes('@')) { setAvisoEmail(true); return }
    onSubmit({
      nome: form.nome, pais: form.pais, email: form.email, telefone: form.telefone,
      contacto_nome: form.contactoNome, nif: form.nif,
      morada: form.morada, cidade: form.cidade, codigo_postal: form.codigoPostal,
      tipo: form.tipo || null, observacoes: form.observacoes,
    })
  }

  return (
    <form onSubmit={submeter} className="a4l-card" style={s.form}>
      {rascunhoRecuperado && <RascunhoAviso onDescartar={descartar} />}
      <Grupo titulo="Identificação">
        <Campo label="Nome *">
          <input
            value={form.nome}
            onChange={(e) => { set('nome', e.target.value); setAvisoNome(false) }}
            placeholder="Nome do cliente / clínica"
            style={{ ...s.input, ...(avisoNome ? s.inputErro : {}) }}
          />
          {avisoNome && <span style={s.aviso}>O nome é obrigatório.</span>}
        </Campo>
        <Linha>
          <Campo label="Tipo">
            <select value={form.tipo} onChange={(e) => set('tipo', e.target.value as TipoCliente | '')} style={s.input}>
              <option value="">—</option>
              {TIPO_CLIENTE_OPCOES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="País">
            <input value={form.pais} onChange={(e) => set('pais', e.target.value)} placeholder="Portugal" style={s.input} />
          </Campo>
        </Linha>
      </Grupo>

      <Grupo titulo="Contacto">
        <Linha>
          <Campo label="Email (para faturação)">
            <input
              type="email"
              value={form.email}
              onChange={(e) => { set('email', e.target.value); setAvisoEmail(false) }}
              placeholder="cliente@exemplo.com"
              style={{ ...s.input, ...(avisoEmail ? s.inputErro : {}) }}
            />
            {avisoEmail && <span style={s.aviso}>Email inválido.</span>}
          </Campo>
          <Campo label="Telefone">
            <input value={form.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="+351 ..." style={s.input} />
          </Campo>
        </Linha>
        <Campo label="Pessoa de contacto">
          <input value={form.contactoNome} onChange={(e) => set('contactoNome', e.target.value)} placeholder="Nome de quem contactas" style={s.input} />
        </Campo>
      </Grupo>

      <Grupo titulo="Morada e faturação">
        <Campo label="NIF">
          <input value={form.nif} onChange={(e) => set('nif', e.target.value)} style={s.input} />
        </Campo>
        <Campo label="Morada">
          <input value={form.morada} onChange={(e) => set('morada', e.target.value)} style={s.input} />
        </Campo>
        <Linha>
          <Campo label="Código-postal">
            <input value={form.codigoPostal} onChange={(e) => set('codigoPostal', e.target.value)} style={s.input} />
          </Campo>
          <Campo label="Cidade">
            <input value={form.cidade} onChange={(e) => set('cidade', e.target.value)} style={s.input} />
          </Campo>
        </Linha>
      </Grupo>

      <Grupo titulo="Notas internas">
        <Campo label="Observações">
          <textarea value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} rows={3} style={{ ...s.input, resize: 'vertical' }} />
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
