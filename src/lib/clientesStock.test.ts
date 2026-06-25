import { describe, it, expect } from 'vitest'
import { nomeClienteStock } from './clientesStock'

describe('nomeClienteStock', () => {
  it('junta os grupos de alta confiança no nome canónico', () => {
    expect(nomeClienteStock('Medica Bazaar')).toBe('Medika Bazaar')
    expect(nomeClienteStock('Medical Bazzar')).toBe('Medika Bazaar')
    expect(nomeClienteStock('Hossan')).toBe('Hossam')
    expect(nomeClienteStock('FAMY')).toBe('Fahmy')
    expect(nomeClienteStock('Fhamy')).toBe('Fahmy')
    expect(nomeClienteStock('Yonan')).toBe('Younan')
    expect(nomeClienteStock('Laserlix')).toBe('Laserix')
    expect(nomeClienteStock('Therapue')).toBe('Therapie')
    expect(nomeClienteStock('X- MED')).toBe('X-Med')
    expect(nomeClienteStock('Xmed')).toBe('X-Med')
    expect(nomeClienteStock('Kejje')).toBe('Keijje')
    expect(nomeClienteStock('La´Skin')).toBe("LA'Skin")
    expect(nomeClienteStock('Davis Calero')).toBe('David Calero')
    expect(nomeClienteStock('MRs Paige')).toBe('Mrs. Paige')
    expect(nomeClienteStock('Paige')).toBe('Mrs. Paige')
    expect(nomeClienteStock('Guluzar- Murat')).toBe('Guluzar Murat')
    expect(nomeClienteStock('Glam Medispa - Monte carlo')).toBe('Glam Medispa Monte Carlo')
    expect(nomeClienteStock('Infinyty kuwait')).toBe('Infinity Kuwait')
    expect(nomeClienteStock('Lumiere')).toBe('Lumier')
  })

  it('junta os grupos ambíguos aprovados', () => {
    expect(nomeClienteStock('Elvin Musayev, Georgia')).toBe('Elvin Musayev')
    expect(nomeClienteStock('Mari Nieves')).toBe('Maria Nieves')
    expect(nomeClienteStock('Ultimate Laser Telheiras')).toBe('Ultimate Laser')
    expect(nomeClienteStock('Ultimatelaser Telheiras')).toBe('Ultimate Laser')
  })

  it('NÃO mexe nos clientes que ficaram de fora', () => {
    expect(nomeClienteStock('Angel')).toBe('Angel')
    expect(nomeClienteStock('Angel Rejala')).toBe('Angel Rejala')
    expect(nomeClienteStock('Ultimatelaser Marques')).toBe('Ultimatelaser Marques')
    expect(nomeClienteStock('Ultimateclinic- Espanha')).toBe('Ultimateclinic- Espanha')
    expect(nomeClienteStock('Infinity Dubai')).toBe('Infinity Dubai')
  })

  it('é insensível a maiúsculas/minúsculas e espaços a mais na comparação', () => {
    expect(nomeClienteStock('  medica   bazaar ')).toBe('Medika Bazaar')
    expect(nomeClienteStock('hossan')).toBe('Hossam')
  })

  it('normaliza espaços nos nomes não mapeados e trata vazios', () => {
    expect(nomeClienteStock('Ruben Arenas ')).toBe('Ruben Arenas')
    expect(nomeClienteStock(null)).toBe('')
    expect(nomeClienteStock('   ')).toBe('')
  })
})
