import { describe, expect, it } from 'vitest'
import type { EvalCompany } from '@/lib/eval/companies'
import { analyseCovenant, curePct, ebitdaCushionPct, ebitdaWhatIf, overviewRows, ratioAfterEbitdaChange, sortByHeadroom } from './covenants'

function company(ticker: string, covenants: EvalCompany['covenants']): EvalCompany {
    return {
        ticker,
        name: `${ticker} Inc.`,
        cik: '1',
        periodEnd: '2026-06-30',
        covenantEbitdaReconciliation: false,
        covenants,
        source: `https://www.sec.gov/${ticker}`,
        agreements: ['https://www.sec.gov/agreement'],
    }
}

describe('ebitdaCushionPct', () => {
    it('is 1 - actual / limit', () => {
        expect(ebitdaCushionPct(3, 4)).toBeCloseTo(25)
        expect(ebitdaCushionPct(4.35, 5.75)).toBeCloseTo(24.348, 2)
    })

    it('is negative in breach', () => {
        expect(ebitdaCushionPct(3.85, 3.75)).toBeCloseTo(-2.667, 2)
    })
})

describe('analyseCovenant', () => {
    it('tests a leverage covenant and adds the cushion', () => {
        const a = analyseCovenant({ name: 'Leverage', operator: '<=', limit: 4, actual: 3 }, '2026-06-30')
        expect(a.result).toMatchObject({ compliant: true, headroom: 1, headroomPct: 25 })
        expect(a.ebitdaCushionPct).toBeCloseTo(25)
    })

    it('has no cushion for a coverage covenant', () => {
        const a = analyseCovenant({ name: 'Coverage', operator: '>=', limit: 2.5, actual: 5 }, '2026-06-30')
        expect(a.result).toMatchObject({ compliant: true, headroom: 2.5, headroomPct: 100 })
        expect(a.ebitdaCushionPct).toBeNull()
    })

    it('leaves an undisclosed actual untested', () => {
        const a = analyseCovenant({ name: 'Coverage', operator: '>=', limit: 2.5, actual: null }, '2026-06-30')
        expect(a.result).toBeNull()
        expect(a.ebitdaCushionPct).toBeNull()
    })
})

describe('sortByHeadroom', () => {
    it('puts the worst headroom first and undisclosed last', () => {
        const rows = [
            { id: 'ok', result: { applicableLimit: 4, compliant: true, headroom: 2, headroomPct: 50 } },
            { id: 'none', result: null },
            { id: 'breach', result: { applicableLimit: 4, compliant: false, headroom: -1, headroomPct: -25 } },
            { id: 'tight', result: { applicableLimit: 4, compliant: true, headroom: 0.4, headroomPct: 10 } },
        ]
        expect(sortByHeadroom(rows).map((r) => r.id)).toEqual(['breach', 'tight', 'ok', 'none'])
    })
})

describe('overviewRows', () => {
    it('lists maintenance covenants only, worst first, with company details', () => {
        const rows = overviewRows([
            company('AAA', [
                { name: 'Leverage', operator: '<=', limit: 4, actual: 2 },
                { name: 'Incurrence coverage', operator: '>=', limit: 2, actual: 2.1, test: 'incurrence' },
            ]),
            company('BBB', [{ name: 'Net Leverage', operator: '<=', limit: 3.75, actual: 3.85 }]),
        ])
        expect(rows.map((r) => [r.ticker, r.name])).toEqual([['BBB', 'Net Leverage'], ['AAA', 'Leverage']])
        expect(rows[0]).toMatchObject({ company: 'BBB Inc.', periodEnd: '2026-06-30', source: 'https://www.sec.gov/BBB' })
        expect(rows[0].result?.compliant).toBe(false)
    })
})

describe('ratioAfterEbitdaChange', () => {
    it('divides leverage and multiplies coverage by the EBITDA factor', () => {
        expect(ratioAfterEbitdaChange('<=', 3, -25)).toBeCloseTo(4)
        expect(ratioAfterEbitdaChange('>=', 4, -25)).toBeCloseTo(3)
        expect(ratioAfterEbitdaChange('<=', 3, 0)).toBe(3)
    })

    it('rejects a change that wipes out EBITDA', () => {
        expect(() => ratioAfterEbitdaChange('<=', 3, -100)).toThrow()
    })
})

describe('curePct', () => {
    it('is a/L - 1 for leverage', () => {
        expect(curePct('<=', 3.85, 3.75)).toBeCloseTo(2.667, 2)
    })

    it('is (L - a) / a for coverage', () => {
        expect(curePct('>=', 2, 2.5)).toBeCloseTo(25)
    })

    it('is 0 when compliant', () => {
        expect(curePct('<=', 3, 4)).toBe(0)
        expect(curePct('>=', 3, 2.5)).toBe(0)
    })
})

describe('ebitdaWhatIf', () => {
    const covenants = [
        { name: 'Leverage', operator: '<=' as const, limit: 4, actual: 3 },
        { name: 'Coverage', operator: '>=' as const, limit: 2.5, actual: 5 },
        { name: 'Undisclosed', operator: '>=' as const, limit: 2.5, actual: null },
    ]

    it('flags covenants that flip to breach and sizes the cure', () => {
        const rows = ebitdaWhatIf(covenants, '2026-06-30', -30)
        expect(rows.map((r) => r.name)).toEqual(['Leverage', 'Coverage'])
        const [leverage, coverage] = rows
        expect(leverage.value).toBeCloseTo(4.2857, 3)
        expect(leverage.flipsToBreach).toBe(true)
        // 4.2857 / 4 - 1 = 7.14% of scenario EBITDA.
        expect(leverage.curePct).toBeCloseTo(7.143, 2)
        expect(coverage.value).toBeCloseTo(3.5)
        expect(coverage.flipsToBreach).toBe(false)
        expect(coverage.curePct).toBeNull()
    })

    it('keeps an existing breach in breach without calling it a flip', () => {
        const [row] = ebitdaWhatIf([{ name: 'Net Leverage', operator: '<=', limit: 3.75, actual: 3.85 }], '2026-06-30', 0)
        expect(row.result.compliant).toBe(false)
        expect(row.flipsToBreach).toBe(false)
        expect(row.curePct).toBeCloseTo(2.667, 2)
    })
})
