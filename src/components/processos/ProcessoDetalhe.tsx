'use client'

import Link from 'next/link'
import StatusBadge from './StatusBadge'
import type { ProcessoCompleto } from '@/types/processo'

function Coluna({ titulo, itens, cor }: { titulo: string; itens: string[]; cor: string }) {
  return (
    <div
      className="processo-section"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 14,
      }}
    >
      <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: cor, marginBottom: 10 }}>
        {titulo}
      </h3>
      {itens && itens.length ? (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {itens.map((t, i) => (
            <li key={i} style={{ fontSize: 13, display: 'flex', gap: 8, lineHeight: 1.4 }}>
              <span style={{ color: cor }}>•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>—</p>
      )}
    </div>
  )
}

export default function ProcessoDetalhe({
  processo,
  isAdmin,
}: {
  processo: ProcessoCompleto
  isAdmin: boolean
}) {
  const accent = `#${processo.area_cor}`

  return (
    <div>
      {/* Cabeçalho só para impressão */}
      <div className="print-header" style={{ display: 'none' }}>
        <strong>All4laser — Manual de Processos</strong> · {processo.area_nome}
      </div>

      {/* Cabeçalho */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderTop: `4px solid ${accent}`,
          borderRadius: 12,
          padding: 18,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
              {processo.area_icone} {processo.area_nome}
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.2 }}>
              {processo.nome}
            </h1>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.print()}
              style={{
                background: 'var(--surface)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Imprimir / PDF
            </button>
            {isAdmin && (
              <Link
                href={`/processos/${processo.area_slug}/${processo.id}/edit`}
                style={{
                  background: 'var(--primary)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontWeight: 700,
                }}
              >
                Editar
              </Link>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
          <StatusBadge status={processo.status} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--foreground)' }}>Responsável:</strong> {processo.responsavel}
          </span>
        </div>

        <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, color: 'var(--foreground)' }}>
          {processo.descricao}
        </p>
      </div>

      {/* Fluxo */}
      {processo.steps && processo.steps.length > 0 && (
        <div
          className="processo-section"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 18,
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: 14 }}>
            Fluxo do processo
          </h2>
          <div style={{ position: 'relative' }}>
            {/* linha vertical conectora */}
            <div
              style={{
                position: 'absolute',
                left: 13,
                top: 12,
                bottom: 12,
                width: 2,
                background: 'var(--border)',
              }}
            />
            <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {processo.steps.map((s) => (
                <li key={s.ordem} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative' }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: accent,
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1,
                    }}
                  >
                    {s.ordem}
                  </span>
                  <span style={{ fontSize: 14, lineHeight: 1.5, paddingTop: 4 }}>{s.acao}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Grid 2x2 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
          marginBottom: 16,
        }}
      >
        <Coluna titulo="Inputs" itens={processo.inputs} cor="#2D6BC4" />
        <Coluna titulo="Outputs" itens={processo.outputs} cor="#00A87A" />
        <Coluna titulo="KPIs" itens={processo.kpis} cor="#7B3FC4" />
        <Coluna titulo="Ferramentas" itens={processo.ferramentas} cor="#D4820A" />
      </div>

      {/* Nota */}
      {processo.notas && (
        <div
          className="processo-section"
          style={{
            background: 'var(--accent-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 14,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>Nota:</strong> {processo.notas}
        </div>
      )}
    </div>
  )
}
