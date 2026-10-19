import { describe, expect, it } from 'vitest'
import { definitionsSection, findDefinitions, findSections, relevantText } from './sections'

const filler = 'The Borrower shall comply with this paragraph at all times during the term of this Agreement.'

const agreement = [
    'CREDIT AGREEMENT',
    'TABLE OF CONTENTS',
    'ARTICLE I DEFINITIONS 1',
    'SECTION 1.01 Defined Terms 1',
    'ARTICLE VII NEGATIVE COVENANTS',
    'SECTION 7.11 Financial Covenants',
    '98',
    'ARTICLE I',
    'DEFINITIONS',
    'SECTION 1.01 Defined Terms. As used in this Agreement, the following terms have the meanings specified below:',
    '“Borrower” has the meaning specified in the preamble.',
    '“Consolidated EBITDA” means, for any period, Consolidated Net Income plus Consolidated Interest Expense.',
    '“Consolidated Interest Expense” means all interest expense of the Borrower.',
    '“Consolidated Net Income” means the net income of the Borrower.',
    '"Consolidated Total Debt" shall mean all Indebtedness of the Borrower.',
    '“Indebtedness” of any Person means all obligations for borrowed money.',
    '“Leverage Ratio” as of any date of determination means the ratio of Consolidated Total Debt to Consolidated EBITDA.',
    '“Unused Term” means a term no covenant refers to.',
    'SECTION 1.02 Other Interpretive Provisions. ' + filler,
    'ARTICLE VII',
    'NEGATIVE COVENANTS',
    'SECTION 7.01 Liens. ' + filler,
    'SECTION 7.11 Financial Covenants.',
    '(a) Maximum Leverage Ratio. Permit the Leverage Ratio as of the end of any fiscal quarter to be greater than 3.50 to 1.00.',
    '7.12 as continued from the line above and not a heading.',
    'SECTION 7.12 Accounting Changes. ' + filler,
    'ARTICLE VIII',
    'EVENTS OF DEFAULT',
    'SECTION 8.01 Events of Default. ' + filler,
].join('\n')

describe('findSections', () => {
    const sections = findSections(agreement)
    const byHeading = (prefix: string) => sections.filter((s) => s.heading.startsWith(prefix))

    it('skips table-of-contents entries', () => {
        expect(byHeading('SECTION 7.11')).toHaveLength(1)
        expect(byHeading('ARTICLE I ')).toHaveLength(1)
        expect(byHeading('ARTICLE I ')[0].heading).toBe('ARTICLE I DEFINITIONS')
    })

    it('classifies definitions, negative covenants and financial covenants', () => {
        expect(sections.map((s) => [s.kind, s.heading.slice(0, 30)])).toEqual([
            ['definitions', 'ARTICLE I DEFINITIONS'],
            ['definitions', 'SECTION 1.01 Defined Terms. As'],
            ['other', 'SECTION 1.02 Other Interpretiv'],
            ['negative-covenants', 'ARTICLE VII NEGATIVE COVENANTS'],
            ['other', 'SECTION 7.01 Liens. The Borrow'],
            ['financial-covenants', 'SECTION 7.11 Financial Covenan'],
            ['other', 'SECTION 7.12 Accounting Change'],
            ['other', 'ARTICLE VIII EVENTS OF DEFAULT'],
            ['other', 'SECTION 8.01 Events of Default'],
        ])
    })

    it('ends a section at the next heading and an article at the next article', () => {
        const covenant = byHeading('SECTION 7.11')[0]
        const body = agreement.slice(covenant.start, covenant.end)
        expect(body.startsWith('SECTION 7.11 Financial Covenants.')).toBe(true)
        expect(body).toContain('3.50 to 1.00')
        expect(body).toContain('7.12 as continued')
        expect(body).not.toContain('Accounting Changes')

        const article = byHeading('ARTICLE VII')[0]
        expect(agreement.slice(article.end).startsWith('ARTICLE VIII')).toBe(true)
    })

    it('handles text without articles or sections', () => {
        expect(findSections('JOINDER AGREEMENT\nThe Company joins the Guaranty.')).toEqual([])
    })

    it('falls back to an inline "Financial Covenants" heading when the text has no line breaks', () => {
        const text = 'ok. 10.2 Negative Covenants. No Liens. 10.3 Financial Covenants. Borrower shall: 10.3.1 Fixed Charge Coverage Ratio. At least 1.00 to 1.00. SECTION 11. EVENTS OF DEFAULT 11.1 Events.'
        const [section] = findSections(text)
        expect(section.kind).toBe('financial-covenants')
        expect(text.slice(section.start, section.end)).toBe('10.3 Financial Covenants. Borrower shall: 10.3.1 Fixed Charge Coverage Ratio. At least 1.00 to 1.00. ')
    })
})

describe('findDefinitions', () => {
    it('finds terms with straight or curly quotes and the usual verbs', () => {
        const section = definitionsSection(findSections(agreement))!
        const terms = findDefinitions(agreement, section).map((d) => d.term)
        expect(terms).toEqual([
            'Borrower', 'Consolidated EBITDA', 'Consolidated Interest Expense', 'Consolidated Net Income',
            'Consolidated Total Debt', 'Indebtedness', 'Leverage Ratio', 'Unused Term',
        ])
    })

    it('runs each definition until the next one', () => {
        const defs = findDefinitions(agreement, definitionsSection(findSections(agreement)))
        const ebitda = defs.find((d) => d.term === 'Consolidated EBITDA')!
        expect(agreement.slice(ebitda.start, ebitda.end)).toBe('“Consolidated EBITDA” means, for any period, Consolidated Net Income plus Consolidated Interest Expense.')
    })

    it('searches the whole text when there is no definitions section', () => {
        const text = 'Section 1. Amendments. “Amendment Effective Date”: the date hereof. The term “Borrower” as used herein means Acme.'
        expect(findDefinitions(text).map((d) => d.term)).toEqual(['Amendment Effective Date', 'Borrower'])
    })
})

describe('relevantText', () => {
    it('keeps the covenant section plus the definitions it needs', () => {
        const result = relevantText(agreement)
        expect(result.covenantFound).toBe(true)
        expect(result.parts[0]).toMatchObject({ kind: 'covenant', label: 'SECTION 7.11 Financial Covenants.' })
        // The whole chain under Leverage Ratio, down to Indebtedness and Consolidated Net Income.
        // Borrower is a hub term and Unused Term is never referenced, so both stay out.
        expect(result.parts.filter((p) => p.kind === 'definition').map((p) => p.label)).toEqual([
            'Consolidated EBITDA', 'Consolidated Interest Expense', 'Consolidated Net Income',
            'Consolidated Total Debt', 'Indebtedness', 'Leverage Ratio',
        ])
        expect(result.text).toContain('greater than 3.50 to 1.00')
        expect(result.text).not.toContain('Unused Term')
        expect(result.text).not.toContain('“Borrower” means')
        for (const p of result.parts) expect(result.text).toContain(agreement.slice(p.start, p.end))
    })

    it('stops at the requested depth', () => {
        const result = relevantText(agreement, { depth: 2 })
        expect(result.parts.filter((p) => p.kind === 'definition').map((p) => p.label)).toEqual([
            'Consolidated EBITDA', 'Consolidated Total Debt', 'Leverage Ratio',
        ])
    })

    it('drops the least-mentioned definitions to stay under maxChars', () => {
        const covenant = findSections(agreement).find((s) => s.kind === 'financial-covenants')!
        const covenantChars = covenant.end - covenant.start
        const result = relevantText(agreement, { maxChars: covenantChars + 120 })
        expect(result.parts.map((p) => p.label)).toEqual(['SECTION 7.11 Financial Covenants.', 'Leverage Ratio'])
    })

    it('returns nothing when there is no financial covenant section', () => {
        const result = relevantText('AMENDMENT NO. 1\n“Borrower” means Acme.\nSection 1. The Credit Agreement is amended.')
        expect(result).toEqual({ text: '', parts: [], covenantFound: false, definitionsFound: 1 })
    })
})
