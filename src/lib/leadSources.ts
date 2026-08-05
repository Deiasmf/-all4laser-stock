// Fontes de leads por email: como distinguir um email que É lead do restante
// correio, e a query Gmail que traz os candidatos. Só matéria de servidor.
//
// Acrescentar uma fonte nova (ex.: MedicalExpo) = juntar uma entrada a FONTES
// e (se preciso) alargar a query de procura.
import type { EmailLead } from './gmailRead'

export type FonteLead = 'bimedis' | 'website'
export type CanalLead = 'bimedis' | 'website'

export const ETIQUETA_PROCESSADA = 'Lead processada'

type Definicao = {
  fonte: FonteLead
  canal: CanalLead
  // Verdadeiro se este email é uma lead desta fonte.
  corresponde: (e: EmailLead) => boolean
}

const inc = (s: string, sub: string) => s.toLowerCase().includes(sub.toLowerCase())

const FONTES: Definicao[] = [
  {
    fonte: 'bimedis', canal: 'bimedis',
    // Bimedis: mensagens de comprador. Exclui newsletters/digests (info@bimedis.info,
    // "New medical equipment requests") pelo assunto.
    corresponde: (e) =>
      inc(e.remetente, 'hello.com@bimedis.com') &&
      inc(e.assunto, 'you have a new message about'),
  },
  {
    fonte: 'website', canal: 'website',
    // Formulário do site (Wix) reencaminhado a partir de comercial@.
    corresponde: (e) =>
      inc(e.remetente, 'comercial@all4laser.com') &&
      (inc(e.corpo, 'formulário') || inc(e.corpo, 'formulario') ||
       inc(e.corpo, 'enviou seu') || inc(e.corpo, 'ha appena inviato') ||
       inc(e.assunto, 'submission') || inc(e.assunto, 'contact')),
  },
]

// Devolve a fonte correspondente (ou null se o email não é uma lead).
export function classificar(e: EmailLead): Definicao | null {
  return FONTES.find((f) => f.corresponde(e)) ?? null
}

// Query Gmail que traz os candidatos (ainda não processados, recentes).
// A filtragem fina é feita depois por classificar().
export function queryCandidatos(): string {
  return `{from:hello.com@bimedis.com from:comercial@all4laser.com} -label:"${ETIQUETA_PROCESSADA}" newer_than:60d`
}
