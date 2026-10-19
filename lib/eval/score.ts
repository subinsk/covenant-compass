import type { CitedCovenant } from '@/lib/extraction/extract'
import type { EvalCovenant } from './companies'

// Scores extracted covenants against the eval set's expected ones.

type Operator = EvalCovenant['operator']

// Words that say nothing about which covenant it is.
const FILLER = new Set(['consolidated', 'ratio', 'maximum', 'minimum', 'max', 'min', 'the', 'of', 'to', 'a', 'financial', 'covenant'])

const LIMIT_TOLERANCE = 0.005

// Lower-cased name tokens without filler words; "Debt to EBITDA" counts as leverage.
export function nameTokens(name: string): Set<string> {
    const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w))
    const tokens = new Set(words)
    if (tokens.has('debt') && tokens.has('ebitda')) tokens.add('leverage')
    return tokens
}

function family(tokens: Set<string>) {
    if (tokens.has('coverage')) return 'coverage'
    if (tokens.has('leverage')) return 'leverage'
    return null
}

function isSubset(a: Set<string>, b: Set<string>) {
    for (const t of a) if (!b.has(t)) return false
    return true
}

// Similarity of two covenant names in [0, 1]: Jaccard overlap of their tokens.
// Returns 0 (no match) when they are different kinds (leverage vs coverage),
// or when the overlap is below 0.5 and neither name's tokens contain the other's
// ("Leverage Ratio" still matches "Total Net Leverage Ratio").
export function nameSimilarity(a: string, b: string): number {
    const ta = nameTokens(a)
    const tb = nameTokens(b)
    if (ta.size === 0 || tb.size === 0) return 0
    const fa = family(ta)
    const fb = family(tb)
    if (fa && fb && fa !== fb) return 0

    let shared = 0
    for (const t of ta) if (tb.has(t)) shared++
    const jaccard = shared / (ta.size + tb.size - shared)
    if (jaccard >= 0.5 || isSubset(ta, tb) || isSubset(tb, ta)) return jaccard
    return 0
}

// 'max' for < and <=, 'min' for > and >=.
export function direction(op: Operator) {
    return op === '<' || op === '<=' ? 'max' : 'min'
}

export type CovenantMatch = {
    expected: EvalCovenant
    extracted: CitedCovenant | null
    similarity: number
}

// Pairs each expected covenant with at most one extracted covenant (and vice
// versa), greedily taking the most similar same-direction pair first.
export function matchCovenants(expected: EvalCovenant[], extracted: CitedCovenant[]) {
    const candidates: { e: number, x: number, similarity: number }[] = []
    expected.forEach((exp, e) => {
        extracted.forEach((ext, x) => {
            if (direction(exp.operator) !== direction(ext.operator)) return
            const similarity = nameSimilarity(exp.name, ext.name)
            if (similarity > 0) candidates.push({ e, x, similarity })
        })
    })
    // Highest similarity first; ties go to the extracted covenant with the right limit.
    const limitOk = (e: number, x: number) => Math.abs(expected[e].limit - extracted[x].limit) < LIMIT_TOLERANCE ? 1 : 0
    candidates.sort((p, q) => q.similarity - p.similarity || limitOk(q.e, q.x) - limitOk(p.e, p.x))

    const byExpected = new Map<number, { x: number, similarity: number }>()
    const usedExtracted = new Set<number>()
    for (const c of candidates) {
        if (byExpected.has(c.e) || usedExtracted.has(c.x)) continue
        byExpected.set(c.e, c)
        usedExtracted.add(c.x)
    }

    const matches: CovenantMatch[] = expected.map((exp, e) => {
        const m = byExpected.get(e)
        return { expected: exp, extracted: m ? extracted[m.x] : null, similarity: m?.similarity ?? 0 }
    })
    return {
        matches,
        unmatchedExpected: matches.filter((m) => !m.extracted).map((m) => m.expected),
        unmatchedExtracted: extracted.filter((_, x) => !usedExtracted.has(x)),
    }
}

export type CovenantScore = {
    expected: EvalCovenant
    extracted: CitedCovenant | null
    found: boolean
    // Same direction (< and <= count as the same). Matching already requires
    // this, so a wrong direction shows up as a missed covenant instead.
    operatorCorrect: boolean
    operatorExact: boolean
    limitCorrect: boolean
    cited: boolean
    limitInQuote: boolean
}

export type CompanyScore = {
    covenants: CovenantScore[]
    // Extracted covenants with no expected match. Candidates for false positives,
    // but the eval set lists only the covenants the 10-Q discloses, so an extra
    // covenant may well be real.
    extra: CitedCovenant[]
    // Expected covenants that aren't maintenance tests, so aren't scored.
    excluded: EvalCovenant[]
}

export function scoreCompany(expected: EvalCovenant[], extracted: CitedCovenant[]): CompanyScore {
    const scored = expected.filter((c) => c.test !== 'incurrence')
    const { matches, unmatchedExtracted } = matchCovenants(scored, extracted)
    return {
        covenants: matches.map(({ expected: exp, extracted: ext }) => ({
            expected: exp,
            extracted: ext,
            found: ext !== null,
            operatorCorrect: ext !== null && direction(ext.operator) === direction(exp.operator),
            operatorExact: ext !== null && ext.operator === exp.operator,
            limitCorrect: ext !== null && Math.abs(ext.limit - exp.limit) < LIMIT_TOLERANCE,
            cited: ext !== null && ext.citation !== null,
            limitInQuote: ext !== null && ext.limitInQuote,
        })),
        extra: unmatchedExtracted,
        excluded: expected.filter((c) => c.test === 'incurrence'),
    }
}

export type EvalSummary = {
    companies: number
    expected: number
    found: number
    operatorCorrect: number
    operatorExact: number
    limitCorrect: number
    cited: number
    limitInQuote: number
    extras: number
    excluded: number
    // found / expected
    recall: number | null
    // The rest are over found covenants.
    limitAccuracy: number | null
    operatorAccuracy: number | null
    operatorExactRate: number | null
    citationRate: number | null
    limitInQuoteRate: number | null
}

function rate(n: number, d: number) {
    return d === 0 ? null : n / d
}

export function summarise(results: CompanyScore[]): EvalSummary {
    const all = results.flatMap((r) => r.covenants)
    const count = (key: 'found' | 'operatorCorrect' | 'operatorExact' | 'limitCorrect' | 'cited' | 'limitInQuote') =>
        all.filter((c) => c[key]).length
    const found = count('found')
    return {
        companies: results.length,
        expected: all.length,
        found,
        operatorCorrect: count('operatorCorrect'),
        operatorExact: count('operatorExact'),
        limitCorrect: count('limitCorrect'),
        cited: count('cited'),
        limitInQuote: count('limitInQuote'),
        extras: results.reduce((n, r) => n + r.extra.length, 0),
        excluded: results.reduce((n, r) => n + (r.excluded?.length ?? 0), 0),
        recall: rate(found, all.length),
        limitAccuracy: rate(count('limitCorrect'), found),
        operatorAccuracy: rate(count('operatorCorrect'), found),
        operatorExactRate: rate(count('operatorExact'), found),
        citationRate: rate(count('cited'), found),
        limitInQuoteRate: rate(count('limitInQuote'), found),
    }
}
