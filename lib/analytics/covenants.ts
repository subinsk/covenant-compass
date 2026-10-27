// Ratio analytics over the disclosed covenants of the eval companies: status,
// headroom, EBITDA cushion and EBITDA what-ifs. We only have the disclosed
// ratios (not their numerator and denominator), so EBITDA moves are applied
// to the ratio itself: leverage = debt / EBITDA, coverage = EBITDA / charges.

import type { EvalCompany, EvalCovenant } from '@/lib/eval/companies'
import { maxDenominatorDrop, testCovenant, type CovenantResult, type Operator } from '@/lib/covenants/test'
import { equityCure } from '@/lib/covenants/scenarios'

export type RatioCovenant = Pick<EvalCovenant, 'name' | 'operator' | 'limit' | 'actual'>

export type CovenantAnalysis = RatioCovenant & {
    // Null when the company didn't disclose the actual ratio.
    result: CovenantResult | null
    // Maximum (leverage) covenants only: percent EBITDA can fall before breach.
    // Negative when already in breach.
    ebitdaCushionPct: number | null
}

export type OverviewRow = CovenantAnalysis & {
    ticker: string
    company: string
    periodEnd: string
    source: string
}

export function isMaximum(operator: Operator): boolean {
    return operator === '<=' || operator === '<'
}

// For a maximum ratio a <= L with EBITDA as denominator: 1 - a/L, as a percent.
export function ebitdaCushionPct(actual: number, limit: number): number {
    return maxDenominatorDrop(actual, 1, limit)
}

export function analyseCovenant(covenant: RatioCovenant, asOf: string): CovenantAnalysis {
    const { name, operator, limit, actual } = covenant
    if (actual === null) return { name, operator, limit, actual, result: null, ebitdaCushionPct: null }
    return {
        name,
        operator,
        limit,
        actual,
        result: testCovenant({ operator, limit }, actual, asOf),
        ebitdaCushionPct: isMaximum(operator) ? ebitdaCushionPct(actual, limit) : null,
    }
}

// Incurrence tests only bite when the borrower takes an action, so the
// analytics cover maintenance covenants only.
export function maintenanceCovenants(company: EvalCompany): EvalCovenant[] {
    return company.covenants.filter((c) => c.test !== 'incurrence')
}

// Worst headroom first; covenants without a disclosed actual go last.
export function sortByHeadroom<T extends { result: CovenantResult | null }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
        if (!a.result || !b.result) return (a.result ? 0 : 1) - (b.result ? 0 : 1)
        return a.result.headroomPct - b.result.headroomPct
    })
}

export function overviewRows(companies: EvalCompany[]): OverviewRow[] {
    const rows = companies.flatMap((company) => maintenanceCovenants(company).map((covenant) => ({
        ...analyseCovenant(covenant, company.periodEnd),
        ticker: company.ticker,
        company: company.name,
        periodEnd: company.periodEnd,
        source: company.source,
    })))
    return sortByHeadroom(rows)
}

// The ratio after EBITDA changes by changePct percent (e.g. -20).
export function ratioAfterEbitdaChange(operator: Operator, actual: number, changePct: number): number {
    const factor = 1 + changePct / 100
    if (factor <= 0) throw new Error('EBITDA change must be above -100%')
    return isMaximum(operator) ? actual / factor : actual * factor
}

// The EBITDA increase that cures a breach, as a percent of the covenant EBITDA
// behind `value`. Uses equityCure with the ratio as numerator over 1:
// leverage needs a/L - 1, coverage needs (L - a) / a. 0 when compliant.
export function curePct(operator: Operator, value: number, limit: number): number {
    const { ebitdaIncreaseNeeded } = equityCure({ numerator: value, denominator: 1, limit, operator })
    if (isMaximum(operator)) return ebitdaIncreaseNeeded * 100
    if (value <= 0) throw new Error('Coverage ratio must be positive')
    return (ebitdaIncreaseNeeded / value) * 100
}

export type WhatIfRow = {
    name: string
    operator: Operator
    limit: number
    actual: number
    value: number
    result: CovenantResult
    flipsToBreach: boolean
    // Percent increase in scenario EBITDA needed to cure; null when compliant.
    curePct: number | null
}

// Re-tests every covenant with a disclosed actual after an EBITDA change.
export function ebitdaWhatIf(covenants: RatioCovenant[], asOf: string, changePct: number): WhatIfRow[] {
    return covenants.flatMap(({ name, operator, limit, actual }) => {
        if (actual === null) return []
        const value = ratioAfterEbitdaChange(operator, actual, changePct)
        const baseline = testCovenant({ operator, limit }, actual, asOf)
        const result = testCovenant({ operator, limit }, value, asOf)
        return [{
            name,
            operator,
            limit,
            actual,
            value,
            result,
            flipsToBreach: baseline.compliant && !result.compliant,
            curePct: result.compliant ? null : curePct(operator, value, limit),
        }]
    })
}
