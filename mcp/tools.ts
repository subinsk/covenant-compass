import { z } from 'zod'
import { cite, splitSentences } from '@/lib/agreements/clauses'
import { findSections } from '@/lib/agreements/sections'
import { loadAgreementText, pageAt, type AgreementText } from '@/lib/agreements/text'
import { maxDenominatorDrop, testCovenant, type CovenantTerms } from '@/lib/covenants/test'
import { evalCompanies } from '@/lib/eval/companies'
import { extractCovenants } from '@/lib/extraction/extract'
import { evaluateWithTrace, formulaSchema, toText } from '@/lib/formulas/formula'

// The logic behind the MCP tools, kept free of the SDK so it can be tested
// directly. Loaders are injectable so tests don't hit EDGAR or an LLM.

export type LoadText = (url: string) => Promise<AgreementText>

const SECTION_EXCERPT_CHARS = 800
const MATCH_EXCERPT_CHARS = 600

export function listEvalCompanies() {
    return evalCompanies.map((c) => ({
        ticker: c.ticker,
        name: c.name,
        periodEnd: c.periodEnd,
        covenants: c.covenants.map((cov) => ({
            name: cov.name,
            operator: cov.operator,
            limit: cov.limit,
            actual: cov.actual,
        })),
        agreements: c.agreements,
    }))
}

export async function findCovenantSections(url: string, load: LoadText = loadAgreementText) {
    const { text, pageStarts } = await load(url)
    return findSections(text)
        .filter((s) => s.kind === 'financial-covenants')
        .map((s) => ({
            heading: s.heading,
            page: pageAt(s.start, pageStarts),
            chars: s.end - s.start,
            excerpt: text.slice(s.start, Math.min(s.end, s.start + SECTION_EXCERPT_CHARS)),
        }))
}

// Case-insensitive search for the query as a phrase (any whitespace between
// its words). Returns each matching sentence once, with its page.
export async function searchAgreement(url: string, query: string, limit = 10, load: LoadText = loadAgreementText) {
    const words = query.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) throw new Error('Query is empty')
    const pattern = new RegExp(words.map(escapeRegExp).join('\\s+'), 'gi')

    const { text, pageStarts } = await load(url)
    const sentences = splitSentences(text)
    const seen = new Set<number>()
    const matches: { page: number, excerpt: string }[] = []
    let total = 0
    for (const m of text.matchAll(pattern)) {
        const c = cite(text, pageStarts, sentences, { start: m.index, end: m.index + m[0].length })
        if (seen.has(c.sentence.start)) continue
        seen.add(c.sentence.start)
        total++
        if (matches.length < limit) matches.push({ page: c.page, excerpt: excerptAround(text, c.sentence, m.index) })
    }
    return { total, matches }
}

export const testCovenantInput = z.object({
    formula: formulaSchema,
    inputs: z.record(z.string(), z.number()),
    defs: z.record(z.string(), formulaSchema).optional(),
    operator: z.enum(['<=', '<', '>=', '>']),
    limit: z.number().positive(),
    stepDowns: z.array(z.object({ from: z.string(), limit: z.number().positive() })).optional(),
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'asOf must be YYYY-MM-DD'),
})

export type TestCovenantInput = z.infer<typeof testCovenantInput>

export function runCovenantTest(input: TestCovenantInput) {
    const { formula, inputs, defs = {}, asOf } = input
    const trace = evaluateWithTrace(formula, inputs, defs)
    const base = { formula: toText(formula), value: trace.value, steps: trace.steps, missing: trace.missing }
    if (trace.value === null) return { ...base, result: null }

    const terms: CovenantTerms = { operator: input.operator, limit: input.limit, stepDowns: input.stepDowns }
    const result = testCovenant(terms, trace.value, asOf)
    return { ...base, result: { ...result, denominatorCushionPct: denominatorCushion(input, result.applicableLimit) } }
}

// For a maximum ratio written as a division: how far the denominator can fall
// before a breach. Null for minimum covenants or formulas that aren't a ratio.
function denominatorCushion({ formula, inputs, defs = {}, operator }: TestCovenantInput, limit: number) {
    if (operator !== '<=' && operator !== '<') return null
    if (formula.op !== 'div') return null
    const numerator = evaluateWithTrace(formula.left, inputs, defs).value
    const denominator = evaluateWithTrace(formula.right, inputs, defs).value
    if (numerator === null || denominator === null || denominator <= 0) return null
    return maxDenominatorDrop(numerator, denominator, limit)
}

export async function extractFromUrl(
    url: string,
    { load = loadAgreementText, extract = extractCovenants, env = process.env }: {
        load?: LoadText
        extract?: typeof extractCovenants
        env?: Record<string, string | undefined>
    } = {},
) {
    const unset = ['LLM_BASE_URL', 'LLM_MODEL'].filter((name) => !env[name])
    if (unset.length) throw new Error(`Extraction needs an LLM: set ${unset.join(' and ')} (and LLM_API_KEY if required)`)

    const { text, pageStarts } = await load(url)
    const { covenants } = await extract(text)
    return covenants.map((c) => ({ ...c, page: c.citation ? pageAt(c.citation.start, pageStarts) : null }))
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The sentence, or for a long one a window of it that keeps the match in view.
function excerptAround(text: string, sentence: { start: number, end: number }, at: number) {
    let start = sentence.start
    let end = sentence.end
    if (end - start > MATCH_EXCERPT_CHARS) {
        start = Math.max(start, at - Math.floor(MATCH_EXCERPT_CHARS / 3))
        end = Math.min(end, start + MATCH_EXCERPT_CHARS)
    }
    const body = text.slice(start, end).replace(/\s+/g, ' ').trim()
    return `${start > sentence.start ? '...' : ''}${body}${end < sentence.end ? '...' : ''}`
}
