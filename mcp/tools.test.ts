import { describe, expect, it, vi } from 'vitest'
import type { Formula } from '@/lib/formulas/formula'
import { extractFromUrl, findCovenantSections, listEvalCompanies, runCovenantTest, searchAgreement } from './tools'

const page1 = [
    'ARTICLE I',
    'DEFINITIONS',
    'Section 1.01 Defined Terms. "Consolidated EBITDA" means net income plus interest, taxes, depreciation and amortization for the period.',
].join('\n')
const page2 = [
    'ARTICLE VII',
    'NEGATIVE COVENANTS',
    'Section 7.11 Financial Covenants. The Borrower shall not permit the Consolidated Leverage Ratio to exceed 3.50 to 1.00. The Borrower shall not permit the Interest Coverage Ratio to be less than 3.00 to 1.00.',
    'Section 7.12 Liens. The Borrower shall not create any Lien on its property except as permitted by this Agreement and the other documents.',
].join('\n')
const doc = { text: `${page1}\n${page2}`, pageStarts: [0, page1.length + 1] }
const load = vi.fn(async () => doc)

const ratio: Formula = { op: 'div', left: { op: 'var', name: 'Debt' }, right: { op: 'var', name: 'EBITDA' } }

describe('listEvalCompanies', () => {
    it('lists companies with covenants and disclosed actuals', () => {
        const companies = listEvalCompanies()
        expect(companies.length).toBeGreaterThan(0)
        const first = companies[0]
        expect(first.ticker).toBeTruthy()
        expect(first.covenants[0]).toHaveProperty('limit')
        expect(first.covenants[0]).toHaveProperty('actual')
    })
})

describe('findCovenantSections', () => {
    it('returns the financial covenant section with its page', async () => {
        const sections = await findCovenantSections('https://example.com/a.htm', load)
        expect(sections).toHaveLength(1)
        expect(sections[0].heading).toContain('Financial Covenants')
        expect(sections[0].page).toBe(2)
        expect(sections[0].excerpt).toMatch(/^Section 7\.11 Financial Covenants/)
    })
})

describe('searchAgreement', () => {
    it('finds sentences case-insensitively with page numbers', async () => {
        const { total, matches } = await searchAgreement('u', 'leverage   RATIO', 10, load)
        expect(total).toBe(1)
        expect(matches[0].page).toBe(2)
        expect(matches[0].excerpt).toBe('The Borrower shall not permit the Consolidated Leverage Ratio to exceed 3.50 to 1.00.')
    })

    it('counts each sentence once and applies the limit', async () => {
        const { total, matches } = await searchAgreement('u', 'the borrower', 1, load)
        expect(total).toBe(3)
        expect(matches).toHaveLength(1)
    })

    it('treats the query literally', async () => {
        expect((await searchAgreement('u', '3.50 (to', 10, load)).total).toBe(0)
    })

    it('keeps the match in view in a long sentence', async () => {
        const text = `The ${'very '.repeat(300)}long sentence ends with the needle here.`
        const { matches } = await searchAgreement('u', 'needle', 10, async () => ({ text, pageStarts: [0] }))
        expect(matches[0].excerpt).toMatch(/^\.\.\..*needle here\.$/)
        expect(matches[0].excerpt.length).toBeLessThanOrEqual(603)
    })

    it('rejects an empty query', async () => {
        await expect(searchAgreement('u', '  ', 10, load)).rejects.toThrow('Query is empty')
    })
})

describe('runCovenantTest', () => {
    it('tests a maximum ratio with headroom and denominator cushion', () => {
        const out = runCovenantTest({ formula: ratio, inputs: { Debt: 300, EBITDA: 100 }, operator: '<=', limit: 4, asOf: '2025-06-30' })
        expect(out.formula).toBe('Debt / EBITDA')
        expect(out.value).toBe(3)
        expect(out.result).toMatchObject({ applicableLimit: 4, compliant: true, headroom: 1, headroomPct: 25 })
        expect(out.result?.denominatorCushionPct).toBeCloseTo(25)
    })

    it('uses step-downs and definitions', () => {
        const out = runCovenantTest({
            formula: { op: 'var', name: 'Leverage' },
            defs: { Leverage: ratio },
            inputs: { Debt: 350, EBITDA: 100 },
            operator: '<=',
            limit: 4,
            stepDowns: [{ from: 'June 30, 2025', limit: 3.25 }],
            asOf: '2025-09-30',
        })
        expect(out.steps).toEqual([{ name: 'Leverage', value: 3.5 }])
        expect(out.result).toMatchObject({ applicableLimit: 3.25, compliant: false })
        // Not written as a division at the top level.
        expect(out.result?.denominatorCushionPct).toBeNull()
    })

    it('gives no cushion for a minimum covenant', () => {
        const out = runCovenantTest({ formula: ratio, inputs: { Debt: 300, EBITDA: 100 }, operator: '>=', limit: 2, asOf: '2025-06-30' })
        expect(out.result).toMatchObject({ compliant: true, headroom: 1, denominatorCushionPct: null })
    })

    it('lists missing inputs instead of a result', () => {
        const out = runCovenantTest({ formula: ratio, inputs: {}, operator: '<=', limit: 4, asOf: '2025-06-30' })
        expect(out).toMatchObject({ value: null, missing: ['Debt', 'EBITDA'], result: null })
    })
})

describe('extractFromUrl', () => {
    it('fails clearly when the LLM is not configured', async () => {
        const extract = vi.fn()
        await expect(extractFromUrl('u', { load, extract, env: {} })).rejects.toThrow('set LLM_BASE_URL and LLM_MODEL')
        expect(extract).not.toHaveBeenCalled()
    })

    it('adds page numbers to cited covenants', async () => {
        const start = doc.text.indexOf('The Borrower shall not permit the Consolidated')
        const extract = vi.fn(async () => ({
            covenants: [{
                name: 'Leverage', metric: 'leverage', operator: '<=', limit: 3.5, quote: 'q',
                citation: { start, end: start + 10 }, verified: true, limitInQuote: true,
            }],
            promptChars: 1,
        }))
        const env = { LLM_BASE_URL: 'http://x', LLM_MODEL: 'm' }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const out = await extractFromUrl('u', { load, extract: extract as any, env })
        expect(extract).toHaveBeenCalledWith(doc.text)
        expect(out[0]).toMatchObject({ name: 'Leverage', page: 2 })
    })
})
