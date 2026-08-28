// FONTE ÚNICA dos contactos/dados da empresa, usada por TODOS os documentos e
// templates (PDFs, fichas, página pública, emails). Nunca hardcoded noutro sítio.
//
// Dois telefones distintos:
//  - telefoneGeral: linha fixa do escritório (rodapé dos documentos gerais).
//  - telefoneComercial: contacto comercial (fichas de produto e página pública).
export const EMPRESA = {
  nome: 'All4laser International Group',
  morada: 'Parque Industrial Via Nova, Rua dos Caniços 31/33, 2625-253 Vialonga, Portugal',
  nif: 'PT508 562 287',
  telefoneGeral: '+351 21 757 69 15',
  telefoneComercial: '+351 92 715 26 72',
  email: 'comercial@all4laser.com',
  website: 'www.all4laser.com',
} as const
