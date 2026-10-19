import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@/lib/llm/client'
import { extractCovenants, locateQuote, numberInText } from './extract'

vi.mock('@/lib/llm/client', () => ({ chat: vi.fn() }))
const chatMock = vi.mocked(chat)

const filler = 'The Borrower shall comply with this paragraph at all times during the term of this Agreement.'
const leverageSentence = '(a) Maximum Leverage Ratio. Permit the Leverage Ratio as of the end of any fiscal quarter to be greater than 3.50 to 1.00.'

const agreement = [
    'CREDIT AGREEMENT',
    'ARTICLE I',
    'DEFINITIONS',
    'SECTION 1.01 Defined Terms. As used in this Agreement, the following terms have the meanings specified below:',
    '“Consolidated EBITDA” means, for any period, Consolidated Net Income plus Consolidated Interest Expense.',
    '“Consolidated Total Debt” means all Indebtedness of the Borrower.',
    '“Leverage Ratio” as of any date of determination means the ratio of Consolidated Total Debt to Consolidated EBITDA.',
    'SECTION 1.02 Other Interpretive Provisions. ' + filler,
    'ARTICLE VII',
    'NEGATIVE COVENANTS',
    'SECTION 7.01 Liens. ' + filler,
    'SECTION 7.11 Financial Covenants.',
    leverageSentence,
    '(b) Minimum Interest Coverage Ratio. Permit the ratio of Consolidated EBITDA to',
    'Consolidated Interest Expense  for any period of four fiscal quarters to be less than 3.00:1.00.',
    'SECTION 7.12 Accounting Changes. ' + filler,
    'ARTICLE VIII',
    'EVENTS OF DEFAULT',
    'SECTION 8.01 Events of Default. ' + filler,
].join('\n')

const leverage = {
    name: 'Maximum Leverage Ratio',
    metric: 'leverage',
    operator: '<=',
    limit: 3.5,
    testFrequency: 'quarterly',
    numerator: 'Consolidated Total Debt',
    denominator: 'Consolidated EBITDA',
    quote: 'Permit the Leverage Ratio as of the end of any fiscal quarter to be greater than 3.50 to 1.00.',
}

function reply(covenants: unknown[]) {
    chatMock.mockResolvedValueOnce(JSON.stringify({ covenants }))
}

describe('locateQuote', () => {
    const text = 'Section 7.11. The “Leverage Ratio” shall not exceed\n  4.00 to 1.00 — tested quarterly. Done.'

    it('finds an exact match', () => {
        const quote = 'tested quarterly.'
        const c = locateQuote(text, quote)
        expect(c).not.toBeNull()
        expect(text.slice(c!.start, c!.end)).toBe(quote)
    })

    it('trims surrounding whitespace from the quote', () => {
        const c = locateQuote(text, '  Done. \n')
        expect(text.slice(c!.start, c!.end)).toBe('Done.')
    })

    it('matches across extra whitespace and newlines', () => {
        const c = locateQuote(text, 'shall not exceed 4.00 to 1.00')
        expect(text.slice(c!.start, c!.end)).toBe('shall not exceed\n  4.00 to 1.00')
    })

    it('matches straight quotes against curly quotes', () => {
        const c = locateQuote(text, 'The "Leverage Ratio" shall')
        expect(text.slice(c!.start, c!.end)).toBe('The “Leverage Ratio” shall')
    })

    it('matches curly quotes in the quote against straight quotes in the text', () => {
        const straight = 'the Borrower\'s "Net Leverage Ratio" is tested'
        const c = locateQuote(straight, 'Borrower’s “Net Leverage Ratio”')
        expect(straight.slice(c!.start, c!.end)).toBe('Borrower\'s "Net Leverage Ratio"')
    })

    it('matches hyphens against en and em dashes', () => {
        const c = locateQuote(text, '1.00 - tested')
        expect(text.slice(c!.start, c!.end)).toBe('1.00 — tested')
        const enDash = 'for the period 2025–2026 inclusive'
        const d = locateQuote(enDash, '2025-2026')
        expect(enDash.slice(d!.start, d!.end)).toBe('2025–2026')
    })

    it('handles everything at once', () => {
        const c = locateQuote(text, '“Leverage Ratio” shall not exceed 4.00 to 1.00 -- tested'.replace('--', '–'))
        expect(text.slice(c!.start, c!.end)).toBe('“Leverage Ratio” shall not exceed\n  4.00 to 1.00 — tested')
    })

    it('returns null when the quote is not in the text', () => {
        expect(locateQuote(text, 'shall not exceed 4.50 to 1.00')).toBeNull()
        expect(locateQuote(text, 'Leverage Ratio shall not exceed')).toBeNull()
        expect(locateQuote(text, '   ')).toBeNull()
    })
})

describe('numberInText', () => {
    it.each([
        ['not exceed 4.00 to 1.00', 4],
        ['not exceed 4.0x', 4],
        ['ratio of 4.00:1.00', 4],
        ['at least 1.25 to 1.00', 1.25],
        ['not exceed 3.5 to 1', 3.5],
        ['more than $1,000,000', 1_000_000],
    ])('finds the limit in %s', (text, value) => {
        expect(numberInText(value, text)).toBe(true)
    })

    it('rejects a limit that is not there', () => {
        expect(numberInText(4.5, 'not exceed 4.00 to 1.00')).toBe(false)
        expect(numberInText(4, 'not exceed 4.50 to 1.00')).toBe(false)
    })
})

describe('extractCovenants', () => {
    beforeEach(() => {
        chatMock.mockReset()
    })

    it('attaches offsets that slice back to each quote', async () => {
        const coverageQuote = 'Permit the ratio of Consolidated EBITDA to Consolidated Interest Expense for any period of four fiscal quarters to be less than 3.00:1.00.'
        reply([
            leverage,
            { name: 'Minimum Interest Coverage Ratio', metric: 'interest-coverage', operator: '>=', limit: 3, quote: coverageQuote, stepDowns: null },
        ])

        const { covenants } = await extractCovenants(agreement)

        expect(covenants).toHaveLength(2)
        const [lev, cov] = covenants
        expect(lev).toMatchObject({ ...leverage, verified: true, limitInQuote: true })
        expect(agreement.slice(lev.citation!.start, lev.citation!.end)).toBe(leverage.quote)
        expect(cov).toMatchObject({ verified: true, limitInQuote: true, stepDowns: undefined })
        expect(agreement.slice(cov.citation!.start, cov.citation!.end))
            .toBe('Permit the ratio of Consolidated EBITDA to\nConsolidated Interest Expense  for any period of four fiscal quarters to be less than 3.00:1.00.')
    })

    it('keeps a covenant with a hallucinated quote but leaves it uncited', async () => {
        reply([{ ...leverage, quote: 'The Leverage Ratio shall not exceed 3.50 to 1.00.' }])

        const { covenants } = await extractCovenants(agreement)

        expect(covenants[0]).toMatchObject({ name: leverage.name, citation: null, verified: false, limitInQuote: true })
    })

    it('flags a limit that does not appear in the quote', async () => {
        reply([{ ...leverage, limit: 4 }])

        const { covenants } = await extractCovenants(agreement)

        expect(covenants[0]).toMatchObject({ verified: true, limitInQuote: false })
    })

    it('sends the relevant text and keeps the prompt under maxChars', async () => {
        reply([])
        const maxChars = 2_500

        const { covenants, promptChars } = await extractCovenants(agreement, { maxChars })

        expect(covenants).toEqual([])
        const messages = chatMock.mock.calls[0][0]
        const prompt = messages.map((m) => m.content).join('')
        expect(prompt.length).toBe(promptChars)
        expect(promptChars).toBeLessThanOrEqual(maxChars)
        expect(messages[0].role).toBe('system')
        expect(messages[0].content).toContain('verbatim')
        expect(messages[1].content).toContain(leverageSentence)
        expect(messages[1].content).toContain('“Leverage Ratio” as of any date')
        expect(messages[1].content).not.toContain('SECTION 8.01')
        expect(chatMock.mock.calls[0][1]).toMatchObject({ json: true })
    })

    it('truncates covenant sections that alone exceed maxChars', async () => {
        reply([])
        const long = agreement.replace(leverageSentence, leverageSentence + ' ' + filler.repeat(40))

        const { promptChars } = await extractCovenants(long, { maxChars: 2_500 })

        expect(promptChars).toBeLessThanOrEqual(2_500)
    })

    it('skips the model when no financial covenant section is found', async () => {
        const result = await extractCovenants('ARTICLE I\nDEFINITIONS\nNothing to see.')

        expect(result).toEqual({ covenants: [], promptChars: 0 })
        expect(chatMock).not.toHaveBeenCalled()
    })
})
