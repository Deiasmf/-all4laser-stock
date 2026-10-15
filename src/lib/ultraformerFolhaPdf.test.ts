import { describe, it, expect } from 'vitest'
import { gerarFolhaUltraformerPdf } from './ultraformerFolhaPdf'
import type { RegistoUltraformer, LinhaRegisto } from './ultraformerRegistos'

function linha(area: 'rosto' | 'corpo', mm: number, entrega: number, recolha: number): LinhaRegisto {
  return {
    id: `l-${area}-${mm}`, registo_id: 'reg', cartucho_id: 'c', area, profundidade_mm: mm,
    serial_number: `SN${mm}`, contador_entrega: entrega, contador_recolha: recolha,
    pulsos_utilizados: recolha - entrega, override_regressao: false, override_motivo: null,
    pulsos_corrigido: null, ordem: 1,
  }
}

const registo: RegistoUltraformer = {
  id: 'reg', aluguer_id: null, equipamento_id: 'eq', serial_number: 'CUR 18D058',
  cliente_id: 'cli', cliente_nome: 'Clínica Teste', stop_entrega_id: 's1', stop_recolha_id: 's2',
  estado: 'recolhido', data_entrega: '2026-10-15T09:30:00Z', responsavel_entrega_nome: 'Motorista',
  clinica_resp_entrega: 'Dra. Ana', clinica_validacao_entrega: true, assinatura_entrega_caminho: null,
  foto_entrega_caminho: null, obs_entrega: 'Sem ocorrências',
  data_recolha: '2026-10-15T18:00:00Z', responsavel_recolha_nome: 'Motorista',
  clinica_resp_recolha: 'Dra. Ana', clinica_validacao_recolha: true, assinatura_recolha_caminho: null,
  foto_recolha_caminho: null, obs_recolha: null,
  total_pulsos_rosto: 540, total_pulsos_corpo: 200, total_pulsos_geral: 740,
  dias_aluguer: 1, dias_mes_antes: 0, valor_total: 281.6, valor_detalhe: null, pedido_fatura_id: null,
  linhas: [linha('rosto', 1.5, 1000, 1300), linha('rosto', 4.5, 500, 740), linha('corpo', 6.0, 2000, 2200)],
}

describe('gerarFolhaUltraformerPdf', () => {
  it('gera um PDF não vazio sem lançar erros', async () => {
    const blob = await gerarFolhaUltraformerPdf(registo, null)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(1500)
    const cab = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))
    expect(cab).toBe('%PDF-') // assinatura de ficheiro PDF
  })
})
