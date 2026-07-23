'use client'

import { useState } from 'react'
import { useFormDraft, RascunhoAviso } from '@/lib/useFormDraft'

// Página PÚBLICA (sem login) — formulário para os clientes preencherem os dados.
// A submissão vai para `registos_cliente` (estado pendente) via /api/registo-cliente
// e só entra na CRM depois de aprovada por um admin.

type Morada = { etiqueta: string; morada: string; cidade: string; codigo_postal: string; pais: string }

const moradaVazia = (): Morada => ({ etiqueta: '', morada: '', cidade: '', codigo_postal: '', pais: 'Portugal' })

// Campos que o rascunho automático guarda (o honeypot `website` e os estados de
// controlo aEnviar/erro/enviado ficam de fora).
type RegistoDraft = {
  nome: string
  nif: string
  email: string
  telefone: string
  contacto: string
  morada: string
  cidade: string
  codigoPostal: string
  pais: string
  entregas: Morada[]
  observacoes: string
}

const REGISTO_VAZIO: RegistoDraft = {
  nome: '', nif: '', email: '', telefone: '', contacto: '',
  morada: '', cidade: '', codigoPostal: '', pais: 'Portugal',
  entregas: [], observacoes: '',
}

export default function RegistoClientePage() {
  const [nome, setNome] = useState('')
  const [nif, setNif] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [contacto, setContacto] = useState('')

  const [morada, setMorada] = useState('')
  const [cidade, setCidade] = useState('')
  const [codigoPostal, setCodigoPostal] = useState('')
  const [pais, setPais] = useState('Portugal')

  const [entregas, setEntregas] = useState<Morada[]>([])
  const [observacoes, setObservacoes] = useState('')
  const [website, setWebsite] = useState('') // honeypot (escondido)

  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  function atualizarEntrega(i: number, campo: keyof Morada, valor: string) {
    setEntregas((lista) => lista.map((m, idx) => (idx === i ? { ...m, [campo]: valor } : m)))
  }

  // Rascunho automático (formulário público longo).
  const valores: RegistoDraft = {
    nome, nif, email, telefone, contacto,
    morada, cidade, codigoPostal, pais,
    entregas, observacoes,
  }
  function restaurar(d: RegistoDraft) {
    setNome(d.nome)
    setNif(d.nif)
    setEmail(d.email)
    setTelefone(d.telefone)
    setContacto(d.contacto)
    setMorada(d.morada)
    setCidade(d.cidade)
    setCodigoPostal(d.codigoPostal)
    setPais(d.pais)
    setEntregas(d.entregas ?? [])
    setObservacoes(d.observacoes)
  }
  const { rascunhoRecuperado, descartar, limpar } = useFormDraft<RegistoDraft>(
    'registo-cliente:novo', valores, restaurar, { emptyState: REGISTO_VAZIO }
  )

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!nome.trim()) return setErro('Indique o nome da empresa ou do cliente.')
    if (!email.trim() && !telefone.trim()) return setErro('Indique pelo menos um contacto (email ou telefone).')

    setAEnviar(true)
    try {
      const r = await fetch('/api/registo-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome, nif, email, telefone, contacto_nome: contacto,
          morada, cidade, codigo_postal: codigoPostal, pais,
          moradas_entrega: entregas,
          observacoes, website,
        }),
      })
      const dados = await r.json().catch(() => ({}))
      setAEnviar(false)
      if (!r.ok || !dados.ok) {
        setErro(dados.erro ?? 'Não foi possível enviar. Tente novamente daqui a pouco.')
        return
      }
      limpar()
      setEnviado(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setAEnviar(false)
      setErro('Não foi possível enviar. Verifique a ligação e tente novamente.')
    }
  }

  if (enviado) {
    return (
      <main style={s.pagina}>
        <div style={s.cartao}>
          <div style={s.marca}>All4laser</div>
          <div style={s.okBox}>
            <h1 style={s.okTitulo}>Obrigado! ✅</h1>
            <p style={s.okTexto}>
              Os seus dados foram enviados com sucesso. A equipa da All4laser vai rever o registo
              e entrar em contacto se for necessário.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={s.pagina}>
      <form style={s.cartao} onSubmit={submeter}>
        <div style={s.marca}>All4laser</div>
        <h1 style={s.titulo}>Registo de Cliente</h1>
        <p style={s.subtitulo}>
          Preencha os seus dados. Os campos com <span style={s.obrig}>*</span> são obrigatórios.
        </p>

        {erro && <div style={s.erro}>{erro}</div>}
        {rascunhoRecuperado && (
          <div style={{ marginBottom: 10 }}>
            <RascunhoAviso onDescartar={descartar} />
          </div>
        )}

        <h2 style={s.seccao}>Identificação</h2>
        <Campo label="Nome da empresa / cliente" obrigatorio>
          <input style={s.input} value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Campo>
        <div style={s.linha2}>
          <Campo label="NIF / Nº de contribuinte">
            <input style={s.input} value={nif} onChange={(e) => setNif(e.target.value)} inputMode="numeric" />
          </Campo>
          <Campo label="Pessoa de contacto">
            <input style={s.input} value={contacto} onChange={(e) => setContacto(e.target.value)} />
          </Campo>
        </div>

        <h2 style={s.seccao}>Contactos</h2>
        <div style={s.linha2}>
          <Campo label="Email">
            <input style={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Campo label="Telefone / Telemóvel">
            <input style={s.input} type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="+351 ..." />
          </Campo>
        </div>
        <p style={s.nota}>Indique pelo menos um contacto (email ou telefone).</p>

        <h2 style={s.seccao}>Morada de faturação</h2>
        <Campo label="Morada">
          <input style={s.input} value={morada} onChange={(e) => setMorada(e.target.value)} />
        </Campo>
        <div style={s.linha3}>
          <Campo label="Cidade">
            <input style={s.input} value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </Campo>
          <Campo label="Código-postal">
            <input style={s.input} value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} />
          </Campo>
          <Campo label="País">
            <input style={s.input} value={pais} onChange={(e) => setPais(e.target.value)} />
          </Campo>
        </div>

        <h2 style={s.seccao}>Moradas de entrega dos equipamentos</h2>
        <p style={s.nota}>Se trabalha em mais do que um espaço, adicione cada morada de entrega.</p>

        {entregas.map((m, i) => (
          <div key={i} style={s.moradaBloco}>
            <div style={s.moradaTopo}>
              <strong style={s.moradaNum}>Morada de entrega {i + 1}</strong>
              <button type="button" style={s.remover} onClick={() => setEntregas((l) => l.filter((_, idx) => idx !== i))}>
                Remover
              </button>
            </div>
            <Campo label="Nome do espaço (ex.: Clínica Porto)">
              <input style={s.input} value={m.etiqueta} onChange={(e) => atualizarEntrega(i, 'etiqueta', e.target.value)} />
            </Campo>
            <Campo label="Morada">
              <input style={s.input} value={m.morada} onChange={(e) => atualizarEntrega(i, 'morada', e.target.value)} />
            </Campo>
            <div style={s.linha3}>
              <Campo label="Cidade">
                <input style={s.input} value={m.cidade} onChange={(e) => atualizarEntrega(i, 'cidade', e.target.value)} />
              </Campo>
              <Campo label="Código-postal">
                <input style={s.input} value={m.codigo_postal} onChange={(e) => atualizarEntrega(i, 'codigo_postal', e.target.value)} />
              </Campo>
              <Campo label="País">
                <input style={s.input} value={m.pais} onChange={(e) => atualizarEntrega(i, 'pais', e.target.value)} />
              </Campo>
            </div>
          </div>
        ))}
        <button type="button" style={s.adicionar} onClick={() => setEntregas((l) => [...l, moradaVazia()])}>
          + Adicionar morada de entrega
        </button>

        <h2 style={s.seccao}>Observações</h2>
        <Campo label="Notas adicionais (opcional)">
          <textarea style={{ ...s.input, minHeight: 90, resize: 'vertical' }} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </Campo>

        {/* Honeypot anti-spam: escondido dos humanos */}
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        />

        <button type="submit" style={{ ...s.botao, opacity: aEnviar ? 0.6 : 1 }} disabled={aEnviar}>
          {aEnviar ? 'A enviar...' : 'Enviar registo'}
        </button>
      </form>
    </main>
  )
}

function Campo({ label, obrigatorio, children }: { label: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div style={s.campo}>
      <label style={s.label}>
        {label} {obrigatorio && <span style={s.obrig}>*</span>}
      </label>
      {children}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  pagina: { minHeight: '100vh', background: 'var(--background, #f5f5fa)', padding: '24px 12px', display: 'flex', justifyContent: 'center' },
  cartao: { width: '100%', maxWidth: 640, background: '#fff', borderRadius: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: 24, boxSizing: 'border-box' },
  marca: { fontWeight: 800, color: 'var(--primary, #6d28d9)', fontSize: 18, marginBottom: 8, letterSpacing: 0.5 },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--foreground, #1f2937)', margin: '0 0 4px' },
  subtitulo: { color: 'var(--muted, #6b7280)', fontSize: 14, margin: '0 0 12px' },
  seccao: { fontSize: 15, fontWeight: 700, color: 'var(--primary, #6d28d9)', margin: '22px 0 8px', borderBottom: '1px solid #eee', paddingBottom: 4 },
  campo: { display: 'flex', flexDirection: 'column', marginBottom: 10 },
  label: { fontWeight: 600, fontSize: 13, marginBottom: 4, color: 'var(--foreground, #374151)' },
  obrig: { color: '#dc2626' },
  input: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  linha2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  linha3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  nota: { fontSize: 12.5, color: 'var(--muted, #6b7280)', margin: '2px 0 6px' },
  moradaBloco: { border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 12, background: '#fafafa' },
  moradaTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  moradaNum: { fontSize: 14, color: 'var(--foreground, #374151)' },
  remover: { background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  adicionar: { width: '100%', padding: 12, background: '#fff', border: '1.5px dashed var(--primary, #6d28d9)', color: 'var(--primary, #6d28d9)', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 4 },
  observacoes: {},
  erro: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 14 },
  botao: { marginTop: 20, width: '100%', padding: 14, background: 'var(--primary, #6d28d9)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  okBox: { textAlign: 'center', padding: '20px 0' },
  okTitulo: { fontSize: 26, fontWeight: 700, color: '#16a34a', margin: '8px 0' },
  okTexto: { color: 'var(--muted, #4b5563)', fontSize: 15, lineHeight: 1.5 },
}
