import { describe, expect, it } from 'vitest'
import { cite, sentenceAt, splitClauses, splitSentences } from './clauses'

function sentences(text: string) {
    return splitSentences(text).map((s) => text.slice(s.start, s.end))
}

describe('splitSentences', () => {
    it('splits on sentence-ending punctuation followed by a capital', () => {
        expect(sentences('The Borrower shall pay. The Lender shall lend! Is it due? Yes.')).toEqual([
            'The Borrower shall pay.', 'The Lender shall lend!', 'Is it due?', 'Yes.',
        ])
    })

    it('does not split on abbreviations', () => {
        const first = 'Acme Holdings, Inc. The Borrower, Beta Co. Ltd. Gamma Corp. Delta, L.P. Under Sec. Five, No. Six, U.S. Law, i.e. Title 11, e.g. Chapter 7, per Smith et al. Ibid applies.'
        expect(sentences(`${first} The parties agree.`)).toEqual([first, 'The parties agree.'])
    })

    it('does not split decimals, ratios or section references', () => {
        const text = 'The Leverage Ratio shall not exceed 4.00 to 1.00 as tested under Section 7.11(a) and Section 7.12. Compliance is tested quarterly.'
        expect(sentences(text)).toEqual([
            'The Leverage Ratio shall not exceed 4.00 to 1.00 as tested under Section 7.11(a) and Section 7.12.',
            'Compliance is tested quarterly.',
        ])
    })

    it('splits after a ratio that ends a sentence', () => {
        expect(sentences('Permit the ratio to exceed 3.50 to 1.00. The Borrower shall comply.')).toEqual([
            'Permit the ratio to exceed 3.50 to 1.00.', 'The Borrower shall comply.',
        ])
    })

    it('keeps closing quotes and parens and splits before quotes and parens', () => {
        const text = 'This is the “Agreement.” “Borrower” means Acme. (b) The Lender (as defined.) Shall lend.'
        expect(sentences(text)).toEqual([
            'This is the “Agreement.”', '“Borrower” means Acme.', '(b) The Lender (as defined.)', 'Shall lend.',
        ])
    })

    it('does not split after numbering labels', () => {
        expect(sentences('1. Definitions apply here. SECTION 7. Covenants apply too.')).toEqual([
            '1. Definitions apply here.', 'SECTION 7. Covenants apply too.',
        ])
    })

    it('splits on blank lines even without punctuation', () => {
        expect(sentences('ARTICLE VII\n\nNEGATIVE COVENANTS\n \nThe Borrower shall not')).toEqual([
            'ARTICLE VII', 'NEGATIVE COVENANTS', 'The Borrower shall not',
        ])
    })

    it('does not split on a single line break without punctuation', () => {
        expect(sentences('the Consolidated\nLeverage Ratio shall not exceed 3.00 to 1.00.')).toHaveLength(1)
    })

    it('splits before a clause line that follows a table row without a period', () => {
        const text = 'not to exceed the ratio below\nPeriod Maximum Ratio\nJune 30, 2024 4.25 to 1.00\n(b) Secured Net Leverage Ratio. Permit:\n(i) foo; and\n(ii) bar.'
        expect(sentences(text)).toEqual([
            'not to exceed the ratio below\nPeriod Maximum Ratio\nJune 30, 2024 4.25 to 1.00',
            '(b) Secured Net Leverage Ratio.',
            'Permit:\n(i) foo; and\n(ii) bar.',
        ])
    })

    it('keeps a lone marker line with the clause after it', () => {
        expect(sentences('Ratios.\n(b)\n(i) permit the ratio to be less than 2.50:1.00.')).toEqual([
            'Ratios.', '(b)\n(i) permit the ratio to be less than 2.50:1.00.',
        ])
    })

    it('does not split after multi-level numbering or a number after a colon', () => {
        expect(sentences('Borrower shall not: 10.3.1. Secured Leverage Ratio. Have a ratio.')).toEqual([
            'Borrower shall not: 10.3.1. Secured Leverage Ratio.', 'Have a ratio.',
        ])
        expect(sentences('as follows: 1. The first one.')).toHaveLength(1)
    })

    it('splits within a range and keeps offsets into the full text', () => {
        const text = 'Ignored. First one. Second one. Ignored too.'
        const start = text.indexOf('First')
        const end = text.indexOf(' Ignored too')
        const spans = splitSentences(text, { start, end })
        expect(spans.map((s) => text.slice(s.start, s.end))).toEqual(['First one.', 'Second one.'])
        expect(spans[0].start).toBe(start)
    })
})

describe('splitClauses', () => {
    it('finds markers after colons, semicolons and line starts', () => {
        const text = 'The Borrower shall not permit: (a) the Leverage Ratio to exceed 3.50 to 1.00; (b) the Interest Coverage Ratio to be less than 3.00 to 1.00, where (i) EBITDA is tested; and (ii) interest is paid; or\n(A) any default.'
        const clauses = splitClauses(text, { start: 0, end: text.length })
        expect(clauses.map((c) => c.label)).toEqual(['(a)', '(b)', '(ii)', '(A)'])
        expect(text.slice(clauses[0].start, clauses[0].end)).toBe('(a) the Leverage Ratio to exceed 3.50 to 1.00;')
        expect(text.slice(clauses[3].start, clauses[3].end)).toBe('(A) any default.')
    })

    it('ignores cross-references and mid-sentence mentions', () => {
        const text = 'Subject to Section 7.11(a) and clause (b) above, the Borrower shall comply with (c) below.'
        expect(splitClauses(text, { start: 0, end: text.length })).toEqual([])
    })

    it('treats a marker at the sentence start as a clause', () => {
        const text = 'Intro. (a) Maximum Leverage Ratio; (b) Minimum Liquidity.'
        const sentence = { start: text.indexOf('(a)'), end: text.length }
        const clauses = splitClauses(text, sentence)
        expect(clauses.map((c) => [c.label, c.start])).toEqual([['(a)', sentence.start], ['(b)', text.indexOf('(b)')]])
    })
})

describe('sentenceAt', () => {
    const text = 'One here. Two here. Three here.'
    const spans = splitSentences(text)

    it('finds the sentence containing an offset, including its boundaries', () => {
        expect(sentenceAt(spans, 0)).toEqual(spans[0])
        expect(sentenceAt(spans, spans[1].start)).toEqual(spans[1])
        expect(sentenceAt(spans, spans[1].end - 1)).toEqual(spans[1])
        expect(sentenceAt(spans, text.length - 1)).toEqual(spans[2])
    })

    it('gives the gap between sentences to the sentence before it', () => {
        expect(sentenceAt(spans, spans[0].end)).toEqual(spans[0])
    })

    it('returns undefined outside all sentences', () => {
        expect(sentenceAt(spans, text.length)).toBeUndefined()
        expect(sentenceAt([], 3)).toBeUndefined()
        expect(sentenceAt(splitSentences('  Hi.'), 0)).toBeUndefined()
    })
})

describe('cite', () => {
    const text = 'Page one text.\nThe Leverage Ratio shall not\nexceed 3.50 to 1.00. Next sentence.'
    const pageStarts = [0, text.indexOf('exceed')]
    const spans = splitSentences(text)

    it('maps offsets to the page and expands to the full sentence', () => {
        const start = text.indexOf('3.50')
        const c = cite(text, pageStarts, spans, { start, end: start + 4 })
        expect(c.page).toBe(2)
        expect(c.start).toBe(start)
        expect(text.slice(c.sentence.start, c.sentence.end)).toBe('The Leverage Ratio shall not\nexceed 3.50 to 1.00.')
        expect(c.excerpt).toBe('The Leverage Ratio shall not exceed 3.50 to 1.00.')
    })

    it('covers every sentence a range spans', () => {
        const start = text.indexOf('text')
        const c = cite(text, pageStarts, spans, { start, end: text.indexOf('Leverage') + 3 })
        expect(c.page).toBe(1)
        expect(c.excerpt).toBe('Page one text. The Leverage Ratio shall not exceed 3.50 to 1.00.')
    })
})
