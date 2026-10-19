// Tests a covenant value against its limit on a given date, and measures how
// far the borrower is from a breach.

export type Operator = '<=' | '<' | '>=' | '>'

export type CovenantTerms = {
    operator: Operator
    limit: number
    stepDowns?: { from: string, limit: number }[]
}

export type CovenantResult = {
    applicableLimit: number
    compliant: boolean
    // Distance to the limit in the safe direction: positive means compliant.
    headroom: number
    // Headroom as a percentage of the limit.
    headroomPct: number
}

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

// Finds a date in a step-down's `from` text and returns it as YYYY-MM-DD.
// Handles "2025-06-30" and "June 30, 2025" (also inside longer text such as
// "fiscal quarter ending June 30, 2025"). Returns null for anything else.
export function parseFromDate(text: string): string | null {
    const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
    if (iso) return iso[0]
    const long = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i)
    if (!long) return null
    const month = months.indexOf(long[1].toLowerCase()) + 1
    return `${long[3]}-${String(month).padStart(2, '0')}-${long[2].padStart(2, '0')}`
}

// The limit in force on `asOf`: the latest dated step-down on or before it,
// otherwise the base limit. Step-downs without a recognisable date are ignored.
export function applicableLimit(terms: CovenantTerms, asOf: string): number {
    let best: { date: string, limit: number } | null = null
    for (const step of terms.stepDowns ?? []) {
        const date = parseFromDate(step.from)
        if (date && date <= asOf && (!best || date >= best.date)) best = { date, limit: step.limit }
    }
    return best ? best.limit : terms.limit
}

export function testCovenant(terms: CovenantTerms, value: number, asOf: string): CovenantResult {
    const limit = applicableLimit(terms, asOf)
    const isMax = terms.operator === '<=' || terms.operator === '<'
    const headroom = isMax ? limit - value : value - limit
    const compliant = terms.operator === '<=' || terms.operator === '>=' ? headroom >= 0 : headroom > 0
    return { applicableLimit: limit, compliant, headroom, headroomPct: (headroom / limit) * 100 }
}

// For a maximum ratio (e.g. Total Debt / EBITDA <= 5.0): the percentage the
// denominator can fall, with the numerator unchanged, before the ratio hits
// the limit. Negative when already in breach.
export function maxDenominatorDrop(numerator: number, denominator: number, limit: number): number {
    if (denominator <= 0) throw new Error('Denominator must be positive')
    if (limit <= 0) throw new Error('Limit must be positive')
    const breachDenominator = numerator / limit
    return (1 - breachDenominator / denominator) * 100
}
