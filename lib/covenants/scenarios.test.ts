import { describe, expect, it } from 'vitest'
import type { Defs, Formula } from '@/lib/formulas/formula'
import { applyShocks, equityCure, runScenario } from './scenarios'

const leverage: Formula = { op: 'div', left: { op: 'var', name: 'Total Debt' }, right: { op: 'var', name: 'EBITDA' } }
const coverage: Formula = { op: 'div', left: { op: 'var', name: 'EBITDA' }, right: { op: 'var', name: 'Interest Expense' } }

describe('applyShocks', () => {
    it('changes each named input by its percentage and leaves the rest', () => {
        const env = { Revenue: 1000, EBITDA: 200, 'Total Debt': 500 }
        const shocked = applyShocks(env, [{ name: 'Revenue', pct: -15 }, { name: 'EBITDA', pct: 10 }])
        expect(shocked.Revenue).toBeCloseTo(850)
        expect(shocked.EBITDA).toBeCloseTo(220)
        expect(shocked['Total Debt']).toBe(500)
        expect(env.Revenue).toBe(1000)
    })

    it('throws on an unknown input', () => {
        expect(() => applyShocks({ Revenue: 1 }, [{ name: 'Revnue', pct: 5 }])).toThrow('Unknown input: Revnue')
    })
})

describe('runScenario', () => {
    const covenants = [
        { name: 'Total Leverage Ratio', formula: leverage, terms: { operator: '<=' as const, limit: 5 } },
        { name: 'Interest Coverage Ratio', formula: coverage, terms: { operator: '>=' as const, limit: 2 } },
    ]

    it('flags a leverage covenant that a -15% EBITDA shock pushes into breach', () => {
        const result = runScenario({
            covenants,
            env: { 'Total Debt': 490, EBITDA: 100, 'Interest Expense': 20 },
            asOf: '2025-06-30',
            shocks: [{ name: 'EBITDA', pct: -15 }],
        })
        const [lev, cov] = result.covenants
        expect(lev.baseline.value).toBeCloseTo(4.9)
        expect(lev.baseline.compliant).toBe(true)
        expect(lev.shocked.value).toBeCloseTo(490 / 85)
        expect(lev.shocked.compliant).toBe(false)
        expect(lev.shocked.headroomPct).toBeLessThan(0)
        expect(lev.flipsToBreach).toBe(true)
        expect(cov.shocked.value).toBeCloseTo(4.25)
        expect(cov.flipsToBreach).toBe(false)
        expect(result.newBreaches).toEqual(['Total Leverage Ratio'])
    })

    it('can shock a defined term', () => {
        const defs: Defs = { EBITDA: { op: 'add', args: [{ op: 'var', name: 'Net Income' }, { op: 'var', name: 'D&A' }] } }
        const result = runScenario({
            covenants: [covenants[0]],
            env: { 'Total Debt': 490, 'Net Income': 70, 'D&A': 30, 'Interest Expense': 20 },
            defs,
            asOf: '2025-06-30',
            shocks: [{ name: 'EBITDA', pct: -15 }],
        })
        expect(result.covenants[0].baseline.value).toBeCloseTo(4.9)
        expect(result.covenants[0].shocked.value).toBeCloseTo(490 / 85)
        expect(result.newBreaches).toEqual(['Total Leverage Ratio'])
    })
})

describe('equityCure', () => {
    it('sizes the EBITDA increase that cures a leverage breach', () => {
        expect(equityCure({ numerator: 600, denominator: 100, limit: 5, operator: '<=' })).toEqual({ ebitdaIncreaseNeeded: 20 })
    })

    it('needs nothing when already compliant', () => {
        expect(equityCure({ numerator: 400, denominator: 100, limit: 5, operator: '<=' })).toEqual({ ebitdaIncreaseNeeded: 0 })
        expect(equityCure({ numerator: 300, denominator: 100, limit: 2, operator: '>=' })).toEqual({ ebitdaIncreaseNeeded: 0 })
    })

    it('sizes the EBITDA increase that cures a coverage breach', () => {
        // EBITDA 150 / interest 100 = 1.5x against a 2.0x minimum: need 200.
        expect(equityCure({ numerator: 150, denominator: 100, limit: 2, operator: '>=' })).toEqual({ ebitdaIncreaseNeeded: 50 })
    })
})
