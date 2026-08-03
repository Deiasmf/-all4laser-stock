// ─────────────────────────────────────────────────────────────────────────────
// Adaptador de tracking automático — ESTRUTURA PREPARADA, NÃO ATIVADA.
//
// Interface única para consultar o estado de um envio numa API agregadora
// (17track ou Ship24 — ambas cobrem expresso e carga aérea por AWB). A
// implementação atual é um STUB: devolve sempre { disponivel: false }.
//
// Para ativar (ver README.md deste módulo):
//   1. Criar conta no serviço (17track/Ship24) e obter a API key.
//   2. Definir a variável de ambiente TRACKING_API_KEY no Vercel.
//   3. Preencher o adaptador abaixo (fetch à API do serviço).
//   4. Ligar um cron (rota /api/tracking/atualizar) que percorre os envios com
//      auto_tracking_enabled=true e grava last_status_raw / last_status_at /
//      estado.
// ─────────────────────────────────────────────────────────────────────────────

export type TrackingStatus = {
  disponivel: boolean          // false enquanto o serviço não estiver ativo
  estado?: 'registado' | 'em_transito' | 'entregue' | 'problema' | 'devolvido'
  descricaoBruta?: string      // texto cru do serviço (guardar em last_status_raw)
  atualizadoEm?: string        // ISO
}

export type TrackingProvider = {
  nome: string
  getTrackingStatus(numero: string, carrierCodeApi: string | null): Promise<TrackingStatus>
}

// Stub — não faz chamadas de rede. Substituir quando ativarmos o serviço.
export const trackingProvider: TrackingProvider = {
  nome: 'stub',
  async getTrackingStatus(): Promise<TrackingStatus> {
    return { disponivel: false }
  },
}

// Ponto de entrada usado pelo resto da app.
export function getTrackingStatus(numero: string, carrierCodeApi: string | null): Promise<TrackingStatus> {
  return trackingProvider.getTrackingStatus(numero, carrierCodeApi)
}
