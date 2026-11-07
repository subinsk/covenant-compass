import { z } from 'zod'

// Tests a covenant value against its limit on a given date, and measures how
// far the borrower is from a breach.

export type Operator = '<=' | '<' | '>=' | '>'

export type StepDown = { from: string, limit: number }

export type CovenantTerms = {
    operator: Operator
    limit: number
    stepDowns?: StepDown[]
}

const stepDownsSchema = z.array(z.object({ from: z.string().trim().min(1), limit: z.number().positive() }))

// Step-downs as stored in a Json column. Anything malformed reads as none.
export function readStepDowns(json: unknown): StepDown[] {
    const parsed = stepDownsSchema.safeParse(json)
    return parsed.success ? parsed.data : []
}

// Step-downs whose start date can't be read. applicableLimit skips them, so the
// earlier limit would keep applying after they start.
export function undatedStepDowns(stepDowns: StepDown[]): StepDown[] {
    return stepDowns.filter(step => parseFromDate(step.from) === null)
}

// The date an obligation is tested at: the end of its period, else its due date.
export function testDate(occurrence: { periodEndDate: Date | string | null, dueDate: Date | string }): string {
    return new Date(occurrence.periodEndDate ?? occurrence.dueDate).toISOString().slice(0, 10)
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

// Reads a stored threshold condition such as "<= 4.0", ">= 1.25x" or "< 3.5 to 1.00".
// Returns null when there is no usable operator and positive limit.
export function parseThreshold(condition: string | null | undefined): { operator: Operator, limit: number } | null {
    const match = condition?.match(/^\s*(<=|>=|<|>)\s*(\d+(?:\.\d+)?)/)
    if (!match) return null
    const limit = Number(match[2])
    if (!(limit > 0)) return null
    return { operator: match[1] as Operator, limit }
}

// Tests a reported value against a stored threshold condition, using the
// step-down in force on asOf (YYYY-MM-DD) when there is one. Headroom is the
// signed percent distance to the limit (negative means breach). Null when the
// condition can't be read, so the caller can still store the value.
export function evaluateThreshold(
    condition: string | null | undefined,
    value: number,
    stepDowns: StepDown[] = [],
    asOf = '',
): { passed: boolean, headroom: number } | null {
    const terms = parseThreshold(condition)
    if (!terms || !Number.isFinite(value)) return null
    const result = testCovenant({ ...terms, stepDowns }, value, asOf)
    return { passed: result.compliant, headroom: result.headroomPct }
}

// The threshold as it applies on asOf: '<= 4' once a step-down to 4 has started.
// Returns the stored condition unchanged when no step-down applies yet.
export function thresholdOn(condition: string | null | undefined, stepDowns: StepDown[], asOf: string): string | null {
    const terms = parseThreshold(condition)
    if (!terms) return condition || null
    const limit = applicableLimit({ ...terms, stepDowns }, asOf)
    return limit === terms.limit ? condition! : `${terms.operator} ${limit}`
}

// '<= 4.5' with one step-down -> '<= 4.5, then 4 from June 30, 2027'.
export function describeThreshold(condition: string | null | undefined, stepDowns: StepDown[]): string | null {
    if (!condition) return null
    if (stepDowns.length === 0) return condition
    return `${condition}, then ${stepDowns.map(step => `${step.limit} from ${step.from}`).join(', then ')}`
}
