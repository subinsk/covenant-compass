import { describe, expect, it } from 'vitest'
import type { CitedCovenant } from '@/lib/extraction/extract'
import type { EvalCovenant } from './companies'
import { matchCovenants, nameSimilarity, scoreCompany, summarise } from './score'

function exp(name: string, operator: EvalCovenant['operator'], limit: number): EvalCovenant {
    return { name, operator, limit, actual: null }
}

function ext(name: string, operator: CitedCovenant['operator'], limit: number, extra: Partial<CitedCovenant> = {}): CitedCovenant {
    return {
        name, operator, limit,
        metric: 'other',
        testFrequency: undefined, stepDowns: undefined, numerator: undefined, denominator: undefined,
        quote: `${name} ${limit}`,
        citation: { start: 0, end: 10 },
        verified: true,
        limitInQuote: true,
        ...extra,
    }
}

describe('nameSimilarity', () => {
    it('ignores filler words like Maximum and Consolidated', () => {
        expect(nameSimilarity('Total Net Leverage Ratio', 'Maximum Total Net Leverage Ratio')).toBe(1)
        expect(nameSimilarity('Interest Coverage Ratio', 'Consolidated Interest Coverage Ratio')).toBe(1)
        expect(nameSimilarity('Consolidated Fixed Charge Coverage Ratio', 'Minimum Fixed Charge Coverage Ratio')).toBe(1)
    })

    it('is case and punctuation insensitive', () => {
        expect(nameSimilarity('Senior Secured Net Leverage Ratio', 'senior secured net-leverage ratio')).toBe(1)
    })

    it('matches a short name contained in a longer one', () => {
        expect(nameSimilarity('Leverage Ratio', 'Consolidated Total Net Leverage Ratio')).toBeGreaterThan(0)
        expect(nameSimilarity('Interest Expense Coverage Ratio', 'Interest Coverage Ratio')).toBeGreaterThan(0)
    })

    it('never matches leverage with coverage', () => {
        expect(nameSimilarity('Interest Coverage Ratio', 'Total Leverage Ratio')).toBe(0)
        expect(nameSimilarity('Consolidated Net Leverage Ratio', 'Consolidated Interest Coverage Ratio')).toBe(0)
    })

    it('treats debt to EBITDA as leverage', () => {
        expect(nameSimilarity('Net Debt to Consolidated Adjusted EBITDA Ratio', 'Net Leverage Ratio')).toBeGreaterThan(0)
        expect(nameSimilarity('Net Debt to Consolidated Adjusted EBITDA Ratio', 'Interest Coverage Ratio')).toBe(0)
    })

    it('rejects names that share too little', () => {
        expect(nameSimilarity('Senior Secured Leverage Ratio', 'Total Leverage Ratio')).toBe(0)
        expect(nameSimilarity('Ratio', 'Leverage Ratio')).toBe(0)
    })
})

describe('matchCovenants', () => {
    it('pairs each expected covenant with the most similar extracted one', () => {
        const expected = [exp('Total Leverage Ratio', '<=', 3.5), exp('Senior Secured Leverage Ratio', '<=', 3), exp('Interest Coverage Ratio', '>=', 3)]
        const extracted = [
            ext('Consolidated Interest Coverage Ratio', '>=', 3),
            ext('Maximum Senior Secured Leverage Ratio', '<=', 3),
            ext('Maximum Total Leverage Ratio', '<=', 3.5),
        ]
        const { matches, unmatchedExpected, unmatchedExtracted } = matchCovenants(expected, extracted)
        expect(matches.map((m) => m.extracted?.name)).toEqual([
            'Maximum Total Leverage Ratio',
            'Maximum Senior Secured Leverage Ratio',
            'Consolidated Interest Coverage Ratio',
        ])
        expect(unmatchedExpected).toEqual([])
        expect(unmatchedExtracted).toEqual([])
    })

    it('prefers an exact name over a partial one', () => {
        const expected = [exp('Leverage Ratio', '<=', 5), exp('Secured Leverage Ratio', '<=', 4)]
        const extracted = [ext('Secured Leverage Ratio', '<=', 4), ext('Leverage Ratio', '<=', 5)]
        const { matches } = matchCovenants(expected, extracted)
        expect(matches[0].extracted?.limit).toBe(5)
        expect(matches[1].extracted?.limit).toBe(4)
    })

    it('requires the same direction, treating < and <= alike', () => {
        const expected = [exp('Secured Leverage Ratio', '<', 5.75)]
        expect(matchCovenants(expected, [ext('Secured Leverage Ratio', '<=', 5.75)]).matches[0].extracted).not.toBeNull()
        const wrong = matchCovenants(expected, [ext('Secured Leverage Ratio', '>=', 5.75)])
        expect(wrong.matches[0].extracted).toBeNull()
        expect(wrong.unmatchedExtracted).toHaveLength(1)
    })

    it('uses each extracted covenant once and reports leftovers on both sides', () => {
        const expected = [exp('Net Leverage Ratio', '<=', 3.75), exp('Interest Coverage Ratio', '>=', 3)]
        const extracted = [ext('Net Leverage Ratio', '<=', 3.75), ext('Total Net Leverage Ratio', '<=', 4), ext('Fixed Charge Coverage Ratio', '>=', 1.25)]
        const { matches, unmatchedExpected, unmatchedExtracted } = matchCovenants(expected, extracted)
        expect(matches[0].extracted?.limit).toBe(3.75)
        expect(unmatchedExpected.map((c) => c.name)).toEqual(['Interest Coverage Ratio'])
        expect(unmatchedExtracted.map((c) => c.name)).toEqual(['Total Net Leverage Ratio', 'Fixed Charge Coverage Ratio'])
    })

    it('breaks name ties in favour of the right limit', () => {
        const expected = [exp('Leverage Ratio', '<=', 5)]
        const extracted = [ext('Leverage Ratio', '<=', 4.5), ext('Leverage Ratio', '<=', 5)]
        expect(matchCovenants(expected, extracted).matches[0].extracted?.limit).toBe(5)
    })

    it('handles empty lists', () => {
        expect(matchCovenants([], [ext('Leverage Ratio', '<=', 5)]).unmatchedExtracted).toHaveLength(1)
        expect(matchCovenants([exp('Leverage Ratio', '<=', 5)], []).unmatchedExpected).toHaveLength(1)
    })
})

describe('scoreCompany', () => {
    it('scores limit within 0.005 as correct', () => {
        const expected = [exp('Leverage Ratio', '<=', 5.125)]
        expect(scoreCompany(expected, [ext('Leverage Ratio', '<=', 5.131)]).covenants[0].limitCorrect).toBe(false)
        expect(scoreCompany(expected, [ext('Leverage Ratio', '<=', 5.1251)]).covenants[0].limitCorrect).toBe(true)
        expect(scoreCompany(expected, [ext('Leverage Ratio', '<=', 5.119)]).covenants[0].limitCorrect).toBe(false)
    })

    it('records direction and exact operator separately', () => {
        const [c] = scoreCompany([exp('Secured Leverage Ratio', '<', 5.75)], [ext('Secured Leverage Ratio', '<=', 5.75)]).covenants
        expect(c.operatorCorrect).toBe(true)
        expect(c.operatorExact).toBe(false)
    })

    it('records citation and limit-in-quote flags', () => {
        const [c] = scoreCompany([exp('Leverage Ratio', '<=', 5)], [ext('Leverage Ratio', '<=', 5, { citation: null, verified: false, limitInQuote: false })]).covenants
        expect(c).toMatchObject({ found: true, limitCorrect: true, cited: false, limitInQuote: false })
    })

    it('marks unfound covenants false throughout and lists extras', () => {
        const score = scoreCompany([exp('Interest Coverage Ratio', '>=', 3)], [ext('Total Leverage Ratio', '<=', 4)])
        expect(score.covenants[0]).toMatchObject({ found: false, extracted: null, operatorCorrect: false, limitCorrect: false, cited: false, limitInQuote: false })
        expect(score.extra.map((c) => c.name)).toEqual(['Total Leverage Ratio'])
    })
})

describe('summarise', () => {
    it('totals counts and computes rates over found covenants', () => {
        const a = scoreCompany(
            [exp('Total Leverage Ratio', '<=', 3.5), exp('Interest Coverage Ratio', '>=', 3)],
            [ext('Total Leverage Ratio', '<=', 3.5), ext('Interest Coverage Ratio', '>', 2.5, { citation: null }), ext('Fixed Charge Coverage Ratio', '>=', 1)],
        )
        const b = scoreCompany([exp('Net Leverage Ratio', '<=', 3.75), exp('Senior Secured Leverage Ratio', '<=', 3)], [ext('Net Leverage Ratio', '<=', 3.75, { limitInQuote: false })])
        const s = summarise([a, b])
        expect(s).toMatchObject({
            companies: 2, expected: 4, found: 3,
            limitCorrect: 2, operatorCorrect: 3, operatorExact: 2, cited: 2, limitInQuote: 2, extras: 1,
        })
        expect(s.recall).toBe(0.75)
        expect(s.limitAccuracy).toBeCloseTo(2 / 3)
        expect(s.operatorAccuracy).toBe(1)
        expect(s.operatorExactRate).toBeCloseTo(2 / 3)
        expect(s.citationRate).toBeCloseTo(2 / 3)
        expect(s.limitInQuoteRate).toBeCloseTo(2 / 3)
    })

    it('returns null rates when nothing is expected or found', () => {
        const s = summarise([])
        expect(s.recall).toBeNull()
        expect(s.limitAccuracy).toBeNull()
        const none = summarise([scoreCompany([exp('Leverage Ratio', '<=', 5)], [])])
        expect(none.recall).toBe(0)
        expect(none.citationRate).toBeNull()
    })
})
