// Pulls the financial values covenant ratios need out of SEC XBRL companyfacts
// JSON (https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json).
// Every value carries the concept and facts it came from so it can be traced
// back to a filing.

export type XbrlFact = {
    start?: string
    end: string
    val: number
    accn: string
    fy?: number | null
    fp?: string | null
    form?: string
    filed: string
    frame?: string
}

export type XbrlConcept = { label?: string | null, units: Record<string, XbrlFact[]> }

export type ConceptFacts = Record<string, XbrlConcept | undefined>

export type CompanyFacts = { cik?: number | string, entityName?: string, facts: Record<string, ConceptFacts | undefined> }

// A concept name, or a net concept whose sign must be flipped to read as an
// expense (e.g. InterestIncomeExpenseNonoperatingNet is negative when the
// company pays more interest than it earns).
export type ConceptRef = string | { name: string, negate: true }

export type SourceFact = { concept: string, accn: string, start?: string, end: string, val: number, filed: string }

export type FoundValue = {
    value: number
    concept: string
    method: 'direct' | 'ytd-bridge' | 'instant' | 'sum'
    sources: SourceFact[]
}

// us-gaap concepts in priority order: the first one with a usable fact wins.
// Picked from the 10-Q filings of the eval companies; keep the list short.
export const durationConcepts = {
    revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax'],
    // NetIncomeLoss is attributable to the parent; ProfitLoss includes noncontrolling interests.
    netIncome: ['NetIncomeLoss', 'ProfitLoss'],
    operatingIncome: ['OperatingIncomeLoss'],
    // InterestPaidNet is cash interest (a last resort); the net concepts include interest income.
    interestExpense: [
        'InterestExpense',
        'InterestExpenseNonoperating',
        'InterestAndDebtExpense',
        'InterestExpenseDebt',
        { name: 'InterestIncomeExpenseNonoperatingNet', negate: true },
        { name: 'InterestIncomeExpenseNet', negate: true },
        'InterestPaidNet',
    ],
    incomeTax: ['IncomeTaxExpenseBenefit'],
    // Depreciation alone (no amortization) is a last resort and understates D&A.
    depreciationAmortization: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'Depreciation'],
} satisfies Record<string, ConceptRef[]>

export const instantConcepts = {
    cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
    // Total debt including current maturities.
    totalDebt: ['LongTermDebt', 'DebtLongtermAndShorttermCombinedAmount', 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities'],
    // Used to build total debt when no total concept is reported.
    longTermDebt: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermLineOfCredit'],
    currentDebt: ['LongTermDebtCurrent', 'DebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'],
} satisfies Record<string, ConceptRef[]>

export type FinancialKey = keyof typeof durationConcepts | keyof typeof instantConcepts

export type Financials = {
    periodEnd: string
    values: Partial<Record<FinancialKey, FoundValue>>
    missing: FinancialKey[]
}

const DAY_MS = 24 * 60 * 60 * 1000
// 52/53-week fiscal years and calendar quirks: a "year" is 350-380 days, and
// period boundaries may drift by up to a week between years.
const YEAR_MIN_DAYS = 350
const YEAR_MAX_DAYS = 380
const TOLERANCE_DAYS = 7

export function financialsAt(companyFacts: CompanyFacts, periodEnd: string): Financials {
    const facts = companyFacts.facts['us-gaap'] ?? {}
    const values: Financials['values'] = {}
    for (const [key, concepts] of Object.entries(durationConcepts)) {
        const found = trailingTwelveMonths(facts, concepts, periodEnd)
        if (found) values[key as FinancialKey] = found
    }
    for (const [key, concepts] of Object.entries(instantConcepts)) {
        const found = instantAt(facts, concepts, periodEnd)
        if (found) values[key as FinancialKey] = found
    }
    if (!values.totalDebt && values.longTermDebt) {
        const parts = [values.longTermDebt, values.currentDebt].filter((v) => v !== undefined)
        values.totalDebt = {
            value: parts.reduce((sum, v) => sum + v.value, 0),
            concept: parts.map((v) => v.concept).join(' + '),
            method: 'sum',
            sources: parts.flatMap((v) => v.sources),
        }
    }
    const keys = [...Object.keys(durationConcepts), ...Object.keys(instantConcepts)] as FinancialKey[]
    return { periodEnd, values, missing: keys.filter((k) => !values[k]) }
}

// Trailing twelve months ending at periodEnd for a duration item (income
// statement, cash flow). Uses a 12-month fact when one is reported; otherwise
// bridges: last fiscal year + current year-to-date - prior year-to-date.
export function trailingTwelveMonths(facts: ConceptFacts, concepts: ConceptRef[], periodEnd: string): FoundValue | null {
    for (const ref of concepts) {
        const { name, sign } = conceptRef(ref)
        const durations = usdFacts(facts, name).filter((f) => f.start !== undefined)

        const direct = durations.find((f) => f.end === periodEnd && isYear(f))
        if (direct) return found(name, 'direct', sign * direct.val, [direct])

        const ytd = durations
            .filter((f) => f.end === periodEnd && days(f) < YEAR_MIN_DAYS)
            .sort((a, b) => days(b) - days(a))[0]
        if (!ytd?.start) continue
        const fiscalYear = durations.find((f) => isYear(f) && near(addDays(f.end, 1), ytd.start!))
        if (!fiscalYear?.start) continue
        const priorYtd = durations.find((f) => near(f.start!, fiscalYear.start!) && Math.abs(days(f) - days(ytd)) <= TOLERANCE_DAYS)
        if (!priorYtd) continue
        return found(name, 'ytd-bridge', sign * (fiscalYear.val + ytd.val - priorYtd.val), [fiscalYear, ytd, priorYtd])
    }
    return null
}

// Balance-sheet value at periodEnd.
export function instantAt(facts: ConceptFacts, concepts: ConceptRef[], periodEnd: string): FoundValue | null {
    for (const ref of concepts) {
        const { name, sign } = conceptRef(ref)
        const fact = usdFacts(facts, name).find((f) => f.start === undefined && f.end === periodEnd)
        if (fact) return found(name, 'instant', sign * fact.val, [fact])
    }
    return null
}

// USD facts for a concept, one per period: the same value is repeated in
// later filings (as comparatives), so keep the most recently filed one.
export function usdFacts(facts: ConceptFacts, concept: string): XbrlFact[] {
    const byPeriod = new Map<string, XbrlFact>()
    for (const fact of facts[concept]?.units.USD ?? []) {
        const key = `${fact.start ?? ''}|${fact.end}`
        const current = byPeriod.get(key)
        if (!current || fact.filed > current.filed) byPeriod.set(key, fact)
    }
    return [...byPeriod.values()]
}

function found(concept: string, method: FoundValue['method'], value: number, facts: XbrlFact[]): FoundValue {
    return {
        value,
        concept,
        method,
        sources: facts.map((f) => ({ concept, accn: f.accn, start: f.start, end: f.end, val: f.val, filed: f.filed })),
    }
}

function conceptRef(ref: ConceptRef) {
    return typeof ref === 'string' ? { name: ref, sign: 1 } : { name: ref.name, sign: -1 }
}

function days(fact: XbrlFact) {
    return (Date.parse(fact.end) - Date.parse(fact.start!)) / DAY_MS + 1
}

function isYear(fact: XbrlFact) {
    const d = days(fact)
    return d >= YEAR_MIN_DAYS && d <= YEAR_MAX_DAYS
}

function near(a: string, b: string) {
    return Math.abs(Date.parse(a) - Date.parse(b)) <= TOLERANCE_DAYS * DAY_MS
}

function addDays(date: string, n: number) {
    return new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10)
}
