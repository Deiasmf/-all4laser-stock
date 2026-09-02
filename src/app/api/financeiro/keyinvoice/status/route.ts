// Estado da configuração da API do Keyinvoice.
// Devolve APENAS booleanos (se as variáveis de ambiente existem) — nunca o valor
// da chave. Serve para a página mostrar "API configurada ✓ / por configurar".

export const runtime = 'nodejs'

export async function GET() {
  return Response.json({
    configurada: !!process.env.KEYINVOICE_API_KEY,
    endpoint: !!process.env.KEYINVOICE_ENDPOINT,
    conta: !!process.env.KEYINVOICE_ACCOUNT,
  })
}
