'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { EMPRESA } from '@/lib/empresa'

// Página pública da ficha de produto (sem login), aberta via link partilhável.
// Mobile-first: pensada para abrir no telemóvel a partir do WhatsApp.
type Handpiece = { nome: string; contador_pulsos: number | null; data_leitura: string | null }
type Ficha = {
  ok: boolean
  disponivel?: boolean
  idioma?: string
  marca?: string | null
  modelo?: string | null
  ano?: string | null
  serial?: string | null
  condicao?: string | null
  condicao_descricao?: string | null
  voltagem?: string | null
  frequencia?: string | null
  dimensoes?: string | null
  peso_kg?: number | null
  software_versao?: string | null
  preco?: number | null
  handpieces?: Handpiece[]
  acessorios?: string[]
  fotos?: string[]
}

const EMAIL = EMPRESA.email
const TEL = EMPRESA.telefoneComercial.replace(/\s/g, '')
const TEL_TXT = EMPRESA.telefoneComercial

type Idioma = 'pt' | 'en' | 'es' | 'fr'
const L: Record<Idioma, Record<string, string>> = {
  pt: { ano: 'Ano', serial: 'Nº de série', condicao: 'Condição', especificacoes: 'Especificações', voltagem: 'Voltagem', frequencia: 'Frequência', dimensoes: 'Dimensões', peso: 'Peso', software: 'Software/versão', handpieces: 'Peças de mão / contadores', contador: 'Contador', leitura: 'Leitura', acessorios: 'Acessórios incluídos', preco: 'Preço', contactar: 'Contactar', indispTit: 'Já não disponível', indispTxt: 'Este equipamento já não está disponível. Contacte-nos para conhecer alternativas.', erroTit: 'Link indisponível', erroTxt: 'Este link não está disponível ou expirou. Contacte-nos para mais informações.', nota: 'Informação sujeita a confirmação. Fotografias do equipamento real.' },
  en: { ano: 'Year', serial: 'Serial number', condicao: 'Condition', especificacoes: 'Specifications', voltagem: 'Voltage', frequencia: 'Frequency', dimensoes: 'Dimensions', peso: 'Weight', software: 'Software/version', handpieces: 'Handpieces / counters', contador: 'Counter', leitura: 'Reading', acessorios: 'Included accessories', preco: 'Price', contactar: 'Contact us', indispTit: 'No longer available', indispTxt: 'This equipment is no longer available. Contact us for alternatives.', erroTit: 'Link unavailable', erroTxt: 'This link is unavailable or has expired. Contact us for more information.', nota: 'Information subject to confirmation. Photographs of the actual equipment.' },
  es: { ano: 'Año', serial: 'Nº de serie', condicao: 'Condición', especificacoes: 'Especificaciones', voltagem: 'Voltaje', frequencia: 'Frecuencia', dimensoes: 'Dimensiones', peso: 'Peso', software: 'Software/versión', handpieces: 'Piezas de mano / contadores', contador: 'Contador', leitura: 'Lectura', acessorios: 'Accesorios incluidos', preco: 'Precio', contactar: 'Contáctenos', indispTit: 'Ya no disponible', indispTxt: 'Este equipo ya no está disponible. Contáctenos para conocer alternativas.', erroTit: 'Enlace no disponible', erroTxt: 'Este enlace no está disponible o ha caducado. Contáctenos para más información.', nota: 'Información sujeta a confirmación. Fotografías del equipo real.' },
  fr: { ano: 'Année', serial: 'Nº de série', condicao: 'État', especificacoes: 'Spécifications', voltagem: 'Tension', frequencia: 'Fréquence', dimensoes: 'Dimensions', peso: 'Poids', software: 'Logiciel/version', handpieces: 'Pièces à main / compteurs', contador: 'Compteur', leitura: 'Lecture', acessorios: 'Accessoires inclus', preco: 'Prix', contactar: 'Nous contacter', indispTit: 'Plus disponible', indispTxt: "Cet équipement n'est plus disponible. Contactez-nous pour des alternatives.", erroTit: 'Lien indisponible', erroTxt: 'Ce lien est indisponible ou a expiré. Contactez-nous pour plus d’informations.', nota: "Informations sous réserve de confirmation. Photographies de l'équipement réel." },
}
function fmtData(d: string | null) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return dia && m && a ? `${dia}/${m}/${a}` : d
}

export default function PaginaPublicaFicha() {
  const token = useParams().token as string
  const [f, setF] = useState<Ficha | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.rpc('ficha_publica', { p_token: token }).then(({ data }) => {
      setF((data as Ficha) ?? { ok: false }); setCarregando(false)
    })
  }, [token])

  const t = L[((f?.idioma as Idioma) ?? 'pt')] ?? L.pt
  const nome = [f?.marca, f?.modelo].filter(Boolean).join(' ')
  const assunto = encodeURIComponent(`All4laser${nome ? ' – ' + nome : ''}`)
  const contacto = (
    <div style={s.contactoBox}>
      <a href={`mailto:${EMAIL}?subject=${assunto}`} style={s.btnContacto}>✉️ {t.contactar}</a>
      <a href={`tel:${TEL}`} style={s.btnContactoSec}>📞 {TEL_TXT}</a>
    </div>
  )

  if (carregando) return <main style={s.page}><p style={s.muted}>A carregar…</p></main>

  if (!f || !f.ok) {
    return (
      <main style={s.page}>
        <div style={s.logo}>All4laser</div>
        <div style={s.card}><h1 style={s.h1}>{t.erroTit}</h1><p style={s.p}>{t.erroTxt}</p>{contacto}</div>
        <Rodape nota={t.nota} />
      </main>
    )
  }

  if (f.disponivel === false) {
    return (
      <main style={s.page}>
        <div style={s.logo}>All4laser</div>
        <div style={s.card}>
          {nome && <div style={s.nomeEq}>{nome}</div>}
          <h1 style={s.h1}>{t.indispTit}</h1>
          <p style={s.p}>{t.indispTxt}</p>
          {contacto}
        </div>
        <Rodape nota={t.nota} />
      </main>
    )
  }

  const fotos = f.fotos ?? []
  return (
    <main style={s.page}>
      <div style={s.logo}>All4laser</div>

      {fotos.length > 0 && (
        <div style={s.galeria}>
          {fotos.map((url, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={i} src={url} alt={`${nome} ${i + 1}`} style={s.foto} />
          ))}
        </div>
      )}

      <h1 style={s.h1}>{nome || '—'}</h1>
      <div style={s.linhaTop}>
        {f.ano && <span style={s.pill}>{t.ano}: {f.ano}</span>}
        {f.condicao && <span style={s.pillCond}>{f.condicao}</span>}
        {f.serial && <span style={s.pill}>{t.serial}: {f.serial}</span>}
      </div>

      {f.condicao_descricao && <p style={s.desc}>{f.condicao_descricao}</p>}

      {f.preco != null && (
        <div style={s.preco}>{t.preco}: {f.preco.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</div>
      )}

      {(f.handpieces?.length ?? 0) > 0 && (
        <section style={s.seccao}>
          <h2 style={s.h2}>{t.handpieces}</h2>
          {f.handpieces!.map((h, i) => (
            <div key={i} style={s.hpLinha}>
              <span style={s.hpNome}>{h.nome}</span>
              <span style={s.hpMeta}>
                {h.contador_pulsos != null ? `${h.contador_pulsos.toLocaleString('pt-PT')} · ` : ''}{t.leitura} {fmtData(h.data_leitura)}
              </span>
            </div>
          ))}
        </section>
      )}

      {(f.acessorios?.length ?? 0) > 0 && (
        <section style={s.seccao}>
          <h2 style={s.h2}>{t.acessorios}</h2>
          <div style={s.chips}>{f.acessorios!.map((a, i) => <span key={i} style={s.chip}>{a}</span>)}</div>
        </section>
      )}

      {(f.voltagem || f.frequencia || f.dimensoes || f.peso_kg != null || f.software_versao) && (
        <section style={s.seccao}>
          <h2 style={s.h2}>{t.especificacoes}</h2>
          {f.voltagem && <Linha r={t.voltagem} v={f.voltagem} />}
          {f.frequencia && <Linha r={t.frequencia} v={f.frequencia} />}
          {f.dimensoes && <Linha r={t.dimensoes} v={f.dimensoes} />}
          {f.peso_kg != null && <Linha r={t.peso} v={`${f.peso_kg} kg`} />}
          {f.software_versao && <Linha r={t.software} v={f.software_versao} />}
        </section>
      )}

      {contacto}
      <Rodape nota={t.nota} />
    </main>
  )
}

function Linha({ r, v }: { r: string; v: string }) {
  return <div style={s.linha}><span style={s.linhaRot}>{r}</span><span style={s.linhaVal}>{v}</span></div>
}
function Rodape({ nota }: { nota: string }) {
  return (
    <footer style={s.rodape}>
      <div>{EMAIL} · {TEL_TXT} · www.all4laser.com</div>
      <div style={s.nota}>{nota}</div>
    </footer>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 640, margin: '0 auto', padding: 16, fontFamily: 'inherit', color: '#0D0B2B' },
  logo: { fontWeight: 800, fontSize: 18, color: '#0D0B2B', margin: '4px 0 12px' },
  muted: { color: '#6E7480', fontSize: 14 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, textAlign: 'center' },
  nomeEq: { fontWeight: 700, fontSize: 16, marginBottom: 6 },
  h1: { fontSize: 22, fontWeight: 800, margin: '6px 0 8px' },
  h2: { fontSize: 15, fontWeight: 700, margin: '0 0 8px' },
  p: { fontSize: 15, color: '#374151', margin: '0 0 14px' },
  galeria: { display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 6, margin: '0 -4px 8px' },
  foto: { height: 240, width: 'auto', borderRadius: 12, objectFit: 'cover', scrollSnapAlign: 'center', flexShrink: 0 },
  linhaTop: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  pill: { background: '#f4f5f7', borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 600 },
  pillCond: { background: '#DBEAFE', color: '#1E40AF', borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 700 },
  desc: { fontSize: 14.5, whiteSpace: 'pre-wrap', margin: '0 0 12px' },
  preco: { fontSize: 18, fontWeight: 800, color: '#065F46', margin: '0 0 12px' },
  seccao: { borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 12 },
  hpLinha: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 13.5, flexWrap: 'wrap' },
  hpNome: { fontWeight: 600 },
  hpMeta: { color: '#6E7480' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { background: '#f4f5f7', borderRadius: 999, padding: '5px 12px', fontSize: 13 },
  linha: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: '1px solid #f0f1f3', fontSize: 13.5 },
  linhaRot: { color: '#6E7480' },
  linhaVal: { fontWeight: 600, textAlign: 'right' },
  contactoBox: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 },
  btnContacto: { background: '#0D0B2B', color: '#fff', borderRadius: 10, padding: '12px 18px', fontWeight: 700, textDecoration: 'none', flex: 1, textAlign: 'center', minWidth: 160 },
  btnContactoSec: { background: '#fff', color: '#0D0B2B', border: '1px solid #0D0B2B', borderRadius: 10, padding: '12px 18px', fontWeight: 700, textDecoration: 'none', flex: 1, textAlign: 'center', minWidth: 160 },
  rodape: { marginTop: 24, paddingTop: 12, borderTop: '1px solid #e5e7eb', fontSize: 11.5, color: '#6E7480', textAlign: 'center' },
  nota: { marginTop: 4 },
}
