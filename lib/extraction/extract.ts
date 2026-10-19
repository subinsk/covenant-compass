import { relevantText } from '@/lib/agreements/sections'
import type { ChatMessage } from '@/lib/llm/client'
import { chatJson } from '@/lib/llm/structured'
import { checkDirection } from './direction'
import { extractionSchema, metrics, type ExtractedCovenant } from './schema'

export type Citation = { start: number, end: number }

export type CitedCovenant = ExtractedCovenant & {
    citation: Citation | null
    verified: boolean
    limitInQuote: boolean
    operatorCorrected: boolean
    directionConflict: boolean
}

const SYSTEM_PROMPT = [
    'You extract financial maintenance covenants from credit agreement excerpts.',
    'Reply with JSON only, in this shape:',
    '{"covenants":[{"name":string,"metric":' + metrics.map((m) => `"${m}"`).join('|')
        + ',"operator":"<="|"<"|">="|">","limit":number,"testFrequency":"quarterly"|"annual"|"other",'
        + '"stepDowns":[{"from":string,"limit":number}],"numerator":string,"denominator":string,"quote":string}]}',
    'Rules:',
    '- Include only financial maintenance covenants (ratio tests the borrower must meet), not negative covenants, baskets or incurrence tests.',
    '- "operator" is the condition the borrower must satisfy: "shall not permit the Leverage Ratio to exceed 3.50 to 1.00" means "<=" with limit 3.5.',
    '- "limit" is the ratio as a number (3.50 to 1.00 -> 3.5). Put later limits in "stepDowns" with the date or period they start from.',
    '- Use the definitions provided to fill "numerator" and "denominator" with the defined terms.',
    '- "quote" must be copied verbatim from the provided text: the sentence(s) that state the limit. Do not paraphrase or shorten.',
    '- Omit optional fields you cannot fill. If there are no financial maintenance covenants, return {"covenants":[]}.',
].join('\n')

const USER_PREFIX = 'Agreement excerpts (financial covenant sections, then definitions):\n\n'

// Extracts financial covenants from the full agreement text and checks each
// quote against that text. `maxChars` caps the whole prompt (system + user).
export async function extractCovenants(
    agreementText: string,
    { maxChars = 60_000 }: { maxChars?: number } = {},
): Promise<{ covenants: CitedCovenant[], promptChars: number }> {
    const budget = maxChars - SYSTEM_PROMPT.length - USER_PREFIX.length
    if (budget <= 0) throw new Error(`maxChars ${maxChars} is too small for the prompt`)

    const relevant = relevantText(agreementText, { maxChars: budget })
    if (!relevant.text) return { covenants: [], promptChars: 0 }

    // relevantText never trims the covenant sections themselves, so cut here if needed.
    const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PREFIX + relevant.text.slice(0, budget) },
    ]
    const promptChars = messages.reduce((n, m) => n + m.content.length, 0)

    const { covenants } = await chatJson(extractionSchema, messages, { temperature: 0 })
    return {
        covenants: covenants.map((c) => {
            const citation = locateQuote(agreementText, c.quote)
            return {
                ...c,
                ...checkDirection(c),
                citation,
                verified: citation !== null,
                limitInQuote: numberInText(c.limit, c.quote),
            }
        }),
        promptChars,
    }
}

const SINGLE_QUOTES = /[‘’‚‛′]/
const DOUBLE_QUOTES = /[“”„‟″]/
const DASHES = /[‐-―−]/

// Collapses whitespace runs and maps curly quotes and dash variants to ASCII,
// recording for each output character the index it came from in `text`.
function normalise(text: string) {
    let out = ''
    const map: number[] = []
    for (let i = 0; i < text.length; i++) {
        let ch = text[i]
        if (/\s/.test(ch)) {
            if (out.endsWith(' ')) continue
            ch = ' '
        } else if (SINGLE_QUOTES.test(ch)) ch = '\''
        else if (DOUBLE_QUOTES.test(ch)) ch = '"'
        else if (DASHES.test(ch)) ch = '-'
        out += ch
        map.push(i)
    }
    return { out, map }
}

// Finds `quote` in `text` and returns its offsets in `text`, or null.
// Tries an exact match first, then one that ignores whitespace differences,
// curly vs straight quotes and dash variants.
export function locateQuote(text: string, quote: string): Citation | null {
    const q = quote.trim()
    if (!q) return null

    const exact = text.indexOf(q)
    if (exact !== -1) return { start: exact, end: exact + q.length }

    const t = normalise(text)
    const nq = normalise(q).out
    const i = t.out.indexOf(nq)
    if (i === -1) return null
    return { start: t.map[i], end: t.map[i + nq.length - 1] + 1 }
}

// True if `value` appears as a number in `text` (4.00, 4.0, 4, 4.00:1.00, 1,000).
export function numberInText(value: number, text: string) {
    return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
        .some((n) => Math.abs(Number(n.replace(/,/g, '')) - value) < 1e-9)
}
