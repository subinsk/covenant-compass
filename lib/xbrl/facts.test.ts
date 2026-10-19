import { describe, expect, it } from 'vitest'
import { financialsAt, instantAt, trailingTwelveMonths, usdFacts, type CompanyFacts, type ConceptFacts, type XbrlFact } from './facts'

function fact(start: string | undefined, end: string, val: number, filed = '2026-08-01', accn = `accn-${end}-${filed}`): XbrlFact {
    return { ...(start ? { start } : {}), end, val, filed, accn, form: '10-Q' }
}

function concepts(map: Record<string, XbrlFact[]>): ConceptFacts {
    return Object.fromEntries(Object.entries(map).map(([name, facts]) => [name, { label: name, units: { USD: facts } }]))
}

describe('trailingTwelveMonths', () => {
    it('uses a 12-month fact ending at the period end', () => {
        const facts = concepts({ NetIncomeLoss: [fact('2025-07-01', '2026-06-30', 120), fact('2026-01-01', '2026-06-30', 60)] })
        const result = trailingTwelveMonths(facts, ['NetIncomeLoss'], '2026-06-30')
        expect(result).toMatchObject({ value: 120, concept: 'NetIncomeLoss', method: 'direct' })
        expect(result?.sources).toHaveLength(1)
    })

    it('bridges fiscal year + current YTD - prior YTD', () => {
        const facts = concepts({
            NetIncomeLoss: [
                fact('2025-01-01', '2025-12-31', 100, '2026-02-20', 'k'),
                fact('2026-01-01', '2026-06-30', 60, '2026-08-01', 'q-now'),
                fact('2025-01-01', '2025-06-30', 50, '2025-08-01', 'q-prior'),
                fact('2026-04-01', '2026-06-30', 35),
            ],
        })
        const result = trailingTwelveMonths(facts, ['NetIncomeLoss'], '2026-06-30')
        expect(result).toMatchObject({ value: 110, method: 'ytd-bridge' })
        expect(result?.sources.map((s) => s.accn)).toEqual(['k', 'q-now', 'q-prior'])
    })

    it('bridges 52/53-week fiscal years whose boundaries drift', () => {
        const facts = concepts({
            NetIncomeLoss: [
                fact('2024-09-28', '2025-10-03', 100),
                fact('2025-10-04', '2026-07-03', 80),
                fact('2024-09-28', '2025-06-27', 70),
            ],
        })
        expect(trailingTwelveMonths(facts, ['NetIncomeLoss'], '2026-07-03')?.value).toBe(110)
    })

    it('falls back to the next concept and flips net concepts', () => {
        const facts = concepts({
            InterestExpense: [fact('2026-01-01', '2026-06-30', 5)],
            InterestIncomeExpenseNonoperatingNet: [fact('2025-07-01', '2026-06-30', -40)],
        })
        const result = trailingTwelveMonths(facts, ['InterestExpense', { name: 'InterestIncomeExpenseNonoperatingNet', negate: true }], '2026-06-30')
        expect(result).toMatchObject({ value: 40, concept: 'InterestIncomeExpenseNonoperatingNet', method: 'direct' })
    })

    it('returns null when no concept can be bridged', () => {
        const facts = concepts({ NetIncomeLoss: [fact('2026-01-01', '2026-06-30', 60)] })
        expect(trailingTwelveMonths(facts, ['NetIncomeLoss', 'ProfitLoss'], '2026-06-30')).toBeNull()
    })
})

describe('instantAt', () => {
    it('reads the balance at the period end, ignoring duration facts', () => {
        const facts = concepts({
            CashAndCashEquivalentsAtCarryingValue: [fact(undefined, '2025-12-31', 10), fact(undefined, '2026-06-30', 25), fact('2026-01-01', '2026-06-30', 99)],
        })
        expect(instantAt(facts, ['CashAndCashEquivalentsAtCarryingValue'], '2026-06-30')).toMatchObject({ value: 25, method: 'instant' })
    })

    it('uses the first concept in priority order', () => {
        const facts = concepts({
            LongTermDebt: [fact(undefined, '2026-06-30', 500)],
            DebtLongtermAndShorttermCombinedAmount: [fact(undefined, '2026-06-30', 510)],
        })
        expect(instantAt(facts, ['DebtLongtermAndShorttermCombinedAmount', 'LongTermDebt'], '2026-06-30')?.concept).toBe('DebtLongtermAndShorttermCombinedAmount')
    })
})

describe('usdFacts', () => {
    it('keeps the latest filed fact for each period', () => {
        const facts = concepts({
            Revenues: [fact('2025-01-01', '2025-06-30', 50, '2025-08-01', 'old'), fact('2025-01-01', '2025-06-30', 52, '2026-08-01', 'restated')],
        })
        expect(usdFacts(facts, 'Revenues')).toEqual([expect.objectContaining({ val: 52, accn: 'restated' })])
    })
})

describe('financialsAt', () => {
    it('collects values, sums total debt and reports missing keys', () => {
        const companyFacts: CompanyFacts = {
            facts: {
                'us-gaap': concepts({
                    NetIncomeLoss: [fact('2025-07-01', '2026-06-30', 120)],
                    CashAndCashEquivalentsAtCarryingValue: [fact(undefined, '2026-06-30', 30)],
                    LongTermDebtNoncurrent: [fact(undefined, '2026-06-30', 400)],
                    LongTermDebtCurrent: [fact(undefined, '2026-06-30', 20)],
                }),
            },
        }
        const result = financialsAt(companyFacts, '2026-06-30')
        expect(result.values.netIncome?.value).toBe(120)
        expect(result.values.cash?.value).toBe(30)
        expect(result.values.totalDebt).toMatchObject({ value: 420, method: 'sum', concept: 'LongTermDebtNoncurrent + LongTermDebtCurrent' })
        expect(result.missing).toEqual(['revenue', 'operatingIncome', 'interestExpense', 'incomeTax', 'depreciationAmortization'])
    })
})
