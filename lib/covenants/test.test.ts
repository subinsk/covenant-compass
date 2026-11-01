import { describe, expect, it } from 'vitest'
import { evaluateWithTrace, type Defs, type Formula } from '@/lib/formulas/formula'
import { applicableLimit, evaluateThreshold, maxDenominatorDrop, parseFromDate, parseThreshold, testCovenant } from './test'

describe('testCovenant', () => {
    it('handles each operator, including the boundary', () => {
        expect(testCovenant({ operator: '<=', limit: 4 }, 4, '2025-06-30').compliant).toBe(true)
        expect(testCovenant({ operator: '<', limit: 4 }, 4, '2025-06-30').compliant).toBe(false)
        expect(testCovenant({ operator: '>=', limit: 3 }, 3, '2025-06-30').compliant).toBe(true)
        expect(testCovenant({ operator: '>', limit: 3 }, 3, '2025-06-30').compliant).toBe(false)
        expect(testCovenant({ operator: '<', limit: 4 }, 3.9, '2025-06-30').compliant).toBe(true)
        expect(testCovenant({ operator: '>', limit: 3 }, 3.1, '2025-06-30').compliant).toBe(true)
    })

    it('gives positive headroom when compliant and negative when in breach', () => {
        expect(testCovenant({ operator: '<=', limit: 5 }, 4, '2025-06-30')).toEqual({
            applicableLimit: 5, compliant: true, headroom: 1, headroomPct: 20,
        })
        expect(testCovenant({ operator: '<=', limit: 5 }, 6, '2025-06-30')).toEqual({
            applicableLimit: 5, compliant: false, headroom: -1, headroomPct: -20,
        })
        expect(testCovenant({ operator: '>=', limit: 2 }, 3, '2025-06-30')).toEqual({
            applicableLimit: 2, compliant: true, headroom: 1, headroomPct: 50,
        })
        expect(testCovenant({ operator: '>=', limit: 2 }, 1.5, '2025-06-30')).toEqual({
            applicableLimit: 2, compliant: false, headroom: -0.5, headroomPct: -25,
        })
    })

    it('tests against the step-down in force on the date', () => {
        const terms = {
            operator: '<=' as const,
            limit: 5,
            stepDowns: [
                { from: 'fiscal quarter ending December 31, 2025', limit: 4 },
                { from: '2025-06-30', limit: 4.5 },
            ],
        }
        expect(testCovenant(terms, 4.25, '2025-03-31')).toMatchObject({ applicableLimit: 5, compliant: true })
        expect(testCovenant(terms, 4.25, '2025-06-30')).toMatchObject({ applicableLimit: 4.5, compliant: true })
        expect(testCovenant(terms, 4.25, '2025-12-31')).toMatchObject({ applicableLimit: 4, compliant: false })
        expect(testCovenant(terms, 4.25, '2026-09-30')).toMatchObject({ applicableLimit: 4, compliant: false })
    })
})

describe('applicableLimit', () => {
    it('ignores step-downs without a recognisable date', () => {
        const terms = { operator: '<=' as const, limit: 5, stepDowns: [{ from: 'the second year after closing', limit: 4 }] }
        expect(applicableLimit(terms, '2030-01-01')).toBe(5)
    })
})

describe('parseFromDate', () => {
    it('reads ISO and written dates', () => {
        expect(parseFromDate('2025-06-30')).toBe('2025-06-30')
        expect(parseFromDate('June 30, 2025')).toBe('2025-06-30')
        expect(parseFromDate('the fiscal quarter ending March 1 2026')).toBe('2026-03-01')
        expect(parseFromDate('Q2 2025')).toBeNull()
    })
})

describe('maxDenominatorDrop', () => {
    it('gives the EBITDA cushion before a leverage breach', () => {
        expect(maxDenominatorDrop(400, 100, 5)).toBeCloseTo(20)
        expect(maxDenominatorDrop(500, 100, 5)).toBeCloseTo(0)
        expect(maxDenominatorDrop(600, 100, 5)).toBeCloseTo(-20)
        expect(maxDenominatorDrop(0, 100, 5)).toBeCloseTo(100)
    })

    it('rejects a non-positive denominator', () => {
        expect(() => maxDenominatorDrop(400, 0, 5)).toThrow('Denominator must be positive')
    })
})

describe('worked example: Total Consolidated Leverage Ratio', () => {
    // Suburban Propane-style covenant: Consolidated Total Debt / Consolidated EBITDA <= 5.75.
    const v = (name: string): Formula => ({ op: 'var', name })
    const defs: Defs = {
        'Consolidated EBITDA': {
            op: 'add',
            args: [v('Consolidated Net Income'), v('Interest Expense'), v('Income Taxes'), v('Depreciation and Amortization')],
        },
        'Total Consolidated Leverage Ratio': { op: 'div', left: v('Consolidated Total Debt'), right: v('Consolidated EBITDA') },
    }
    const inputs = {
        'Consolidated Total Debt': 1250,
        'Consolidated Net Income': 120,
        'Interest Expense': 75,
        'Income Taxes': 2,
        'Depreciation and Amortization': 115,
    }

    it('is compliant with about 30% EBITDA cushion', () => {
        const trace = evaluateWithTrace(v('Total Consolidated Leverage Ratio'), inputs, defs)
        expect(trace.missing).toEqual([])
        expect(trace.steps[0]).toEqual({ name: 'Consolidated EBITDA', value: 312 })
        expect(trace.value).toBeCloseTo(4.006, 3)

        const result = testCovenant({ operator: '<=', limit: 5.75 }, trace.value!, '2025-06-28')
        expect(result.compliant).toBe(true)
        expect(result.headroom).toBeCloseTo(1.744, 3)

        // EBITDA can fall from 312 to 1250 / 5.75 = 217.4 before breach.
        expect(maxDenominatorDrop(1250, 312, 5.75)).toBeCloseTo(30.32, 2)
        expect(maxDenominatorDrop(1250, 312, 5.75)).toBeCloseTo(result.headroomPct, 10)
    })

    it('asks for the inputs it lacks', () => {
        const { value, missing } = evaluateWithTrace(v('Total Consolidated Leverage Ratio'), { 'Consolidated Total Debt': 1250 }, defs)
        expect(value).toBeNull()
        expect(missing).toEqual(['Consolidated Net Income', 'Interest Expense', 'Income Taxes', 'Depreciation and Amortization'])
    })
})

describe('parseThreshold', () => {
    it('reads the operator and limit from stored conditions', () => {
        expect(parseThreshold('<= 4.0')).toEqual({ operator: '<=', limit: 4 })
        expect(parseThreshold(' >=1.25x')).toEqual({ operator: '>=', limit: 1.25 })
        expect(parseThreshold('< 3.5 to 1.00')).toEqual({ operator: '<', limit: 3.5 })
        expect(parseThreshold('> 2')).toEqual({ operator: '>', limit: 2 })
    })

    it('returns null for missing or unreadable conditions', () => {
        expect(parseThreshold(null)).toBeNull()
        expect(parseThreshold(undefined)).toBeNull()
        expect(parseThreshold('')).toBeNull()
        expect(parseThreshold('Leverage below 4x')).toBeNull()
        expect(parseThreshold('<= abc')).toBeNull()
        expect(parseThreshold('<= 0')).toBeNull()
        expect(parseThreshold('= 4.0')).toBeNull()
    })
})

describe('evaluateThreshold', () => {
    it('passes a maximum covenant at or under the limit, with signed headroom', () => {
        expect(evaluateThreshold('<= 4.0', 3)).toEqual({ passed: true, headroom: 25 })
        expect(evaluateThreshold('<= 4.0', 4)).toEqual({ passed: true, headroom: 0 })
        expect(evaluateThreshold('<= 4.0', 5)).toEqual({ passed: false, headroom: -25 })
        expect(evaluateThreshold('< 4.0', 4)).toEqual({ passed: false, headroom: 0 })
    })

    it('passes a minimum covenant at or over the limit', () => {
        expect(evaluateThreshold('>= 1.25', 1.5)).toEqual({ passed: true, headroom: 20 })
        expect(evaluateThreshold('>= 2', 1.5)).toEqual({ passed: false, headroom: -25 })
    })

    it('returns null when the condition or value cannot be evaluated', () => {
        expect(evaluateThreshold(null, 3)).toBeNull()
        expect(evaluateThreshold('no limit given', 3)).toBeNull()
        expect(evaluateThreshold('<= 4.0', Number.NaN)).toBeNull()
    })
})
