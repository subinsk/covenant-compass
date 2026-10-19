import { describe, expect, it, vi } from 'vitest'
import type { CitedCovenant } from '@/lib/extraction/extract'
import type { EvalCompany } from './companies'
import { mergeCovenants, reportPath, runExtractionEval } from './run'

function ext(name: string, operator: CitedCovenant['operator'], limit: number, verified = true): CitedCovenant {
    return {
        name, operator, limit,
        metric: 'other',
        testFrequency: undefined, stepDowns: undefined, numerator: undefined, denominator: undefined,
        quote: `${name} ${limit}`,
        citation: verified ? { start: 0, end: 5 } : null,
        verified,
        limitInQuote: true,
    }
}

function company(ticker: string, covenants: EvalCompany['covenants'], agreements: string[]): EvalCompany {
    return {
        ticker, name: ticker, cik: '1', periodEnd: '2025-06-30', covenantEbitdaReconciliation: false,
        covenants, source: 'https://www.sec.gov/x', agreements,
    }
}

const companies = [
    company('AAA', [
        { name: 'Total Net Leverage Ratio', operator: '<=', limit: 4, actual: 2 },
        { name: 'Interest Coverage Ratio', operator: '>=', limit: 3, actual: 5 },
    ], ['https://a/credit', 'https://a/amendment']),
    company('BBB', [{ name: 'Fixed Charge Coverage Ratio', operator: '>=', limit: 1.25, actual: 2 }], ['https://b/credit']),
]

// Fake extraction keyed by the agreement text the fake loader returns.
const byText: Record<string, CitedCovenant[]> = {
    'text of https://a/credit': [ext('Maximum Total Net Leverage Ratio', '<=', 4.5, false), ext('Consolidated Interest Coverage Ratio', '>=', 3)],
    'text of https://a/amendment': [ext('Total Net Leverage Ratio', '<=', 4), ext('Capital Expenditures', '<=', 50)],
}

describe('runExtractionEval', () => {
    it('loads, extracts, merges and scores each company end to end', async () => {
        const loadText = vi.fn(async (url: string) => {
            if (url === 'https://b/credit') throw new Error('404 Not Found')
            return `text of ${url}`
        })
        const extract = vi.fn(async (text: string) => ({ covenants: byText[text], promptChars: text.length }))
        const seen: string[] = []

        const { companies: runs, summary } = await runExtractionEval({ loadText, extract, companies, onCompany: (r) => seen.push(r.ticker) })

        expect(seen).toEqual(['AAA', 'BBB'])
        expect(extract).toHaveBeenCalledTimes(2)
        const [a, b] = runs
        expect(a.agreements).toEqual([
            { url: 'https://a/credit', extracted: 2, promptChars: 'text of https://a/credit'.length },
            { url: 'https://a/amendment', extracted: 2, promptChars: 'text of https://a/amendment'.length },
        ])
        // The verified quote from the amendment wins over the unverified one.
        expect(a.covenants[0]).toMatchObject({ found: true, limitCorrect: true, cited: true })
        expect(a.covenants[1]).toMatchObject({ found: true, limitCorrect: true })
        expect(a.extra.map((c) => c.name)).toEqual(['Capital Expenditures'])

        expect(b.agreements[0].error).toBe('404 Not Found')
        expect(b.covenants[0].found).toBe(false)

        expect(summary).toMatchObject({ companies: 2, expected: 3, found: 2, limitCorrect: 2, extras: 1 })
    })

    it('runs only the requested tickers, case-insensitively', async () => {
        const extract = vi.fn(async () => ({ covenants: [], promptChars: 0 }))
        const { companies: runs } = await runExtractionEval({ tickers: ['bbb'], loadText: async () => 'x', extract, companies })
        expect(runs.map((r) => r.ticker)).toEqual(['BBB'])
    })

    it('rejects unknown tickers before doing any work', async () => {
        const loadText = vi.fn(async () => 'x')
        await expect(runExtractionEval({ tickers: ['ZZZ'], loadText, extract: async () => ({ covenants: [], promptChars: 0 }), companies }))
            .rejects.toThrow('Unknown ticker ZZZ. Eval set: AAA, BBB')
        expect(loadText).not.toHaveBeenCalled()
    })
})

describe('mergeCovenants', () => {
    it('keeps one covenant per name and direction, preferring verified ones', () => {
        const merged = mergeCovenants([
            [ext('Maximum Leverage Ratio', '<=', 5, false), ext('Interest Coverage Ratio', '>=', 3)],
            [ext('Consolidated Leverage Ratio', '<=', 4.5), ext('Consolidated Interest Coverage Ratio', '>=', 2.5)],
        ])
        expect(merged.map((c) => [c.name, c.limit])).toEqual([['Consolidated Leverage Ratio', 4.5], ['Interest Coverage Ratio', 3]])
    })
})

describe('reportPath', () => {
    it('builds a file-system-safe name from the time and model', () => {
        expect(reportPath('openai/gpt-oss-120b', new Date('2026-10-19T12:34:56.789Z')))
            .toBe('.cache/eval/extraction-2026-10-19T12-34-56-789Z-openai-gpt-oss-120b.json')
        expect(reportPath('qwen3:8b', new Date(0))).toBe('.cache/eval/extraction-1970-01-01T00-00-00-000Z-qwen3-8b.json')
    })
})
