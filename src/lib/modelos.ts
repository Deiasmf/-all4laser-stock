// Normalização do nome do modelo para a vista de Stock.
//
// Os dados de `modelo` na base de dados estão inconsistentes (maiúsculas/minúsculas,
// abreviaturas, erros de escrita). Esta função NÃO altera a base de dados — devolve
// apenas um nome canónico para mostrar, agrupar e filtrar no Stock.
//
// O sinal mais fiável é o prefixo do serial number (formato `9914-XXXX-NNNN`),
// em que os 4 dígitos do meio identificam o modelo.

// Devolve os 4 dígitos do código do modelo a partir do serial (ou null).
// Tolera espaços e a falta do traço (ex.: "99149035-4934").
function codigoSerial(serial: string | null): string | null {
  if (!serial) return null
  const m = serial.replace(/\s+/g, '').match(/^9914-?(\d{4})/)
  return m ? m[1] : null
}

// Nome canónico do modelo (estilo oficial Candela) para a vista de Stock.
export function nomeModeloStock(
  modelo: string | null,
  serial: string | null
): string {
  const codigo = codigoSerial(serial)

  // 1. Regras por prefixo de serial (autoritativas — "Separa")
  if (codigo === '0300' || codigo === '0310') return 'Vbeam Perfecta'
  if (codigo === '9015') return 'Gentle Pro'
  if (codigo === '9030') return 'Gentle Pro-U'
  if (codigo === '9035') return 'GentleMax Pro'
  if (codigo === '9036') return 'GentleMax Pro Plus'

  const texto = (modelo ?? '').replace(/\s+/g, ' ').trim()

  // 2. Restantes Vbeam (qualquer escrita / outro serial) → "Vbeam"
  if (/vbeam/i.test(texto)) return 'Vbeam'

  // 3. Unificação textual de GPRO / Gmax Pro (sem distinção de maiúsculas).
  //    Usa o texto compacto (sem espaços/traços) para apanhar variantes como
  //    "Gentle MAXPRO", "GentleMAXPRO", "Gmaxpro", "Gmax Pro".
  const compacto = texto.toLowerCase().replace(/[\s\-_.]/g, '')
  const ehGmax =
    /gentlemaxpro/.test(compacto) ||
    /gmaxpro/.test(compacto) ||
    /\bgpro\b/.test(texto.toLowerCase())
  if (ehGmax) {
    return /plus/.test(compacto) ? 'GentleMax Pro Plus' : 'GentleMax Pro'
  }

  // 4. Gentle Pro / Gentle Pro-U escritos de várias formas (sem serial 9015/9030).
  //    Correspondência exata para NÃO apanhar modelos vizinhos legítimos como
  //    "Gentle Yag Pro-U", "Gentle Pro LE" ou "Gentle Carcaçon Pro".
  if (compacto === 'gentleprou') return 'Gentle Pro-U'
  if (compacto === 'gentlepro') return 'Gentle Pro'
  if (compacto === 'gentleyagprou') return 'Gentle Yag Pro-U'
  if (compacto === 'harmonyxlpro') return 'Harmony XL Pro'

  // 5. Tudo o resto fica como está (apenas com espaços normalizados)
  return texto
}
