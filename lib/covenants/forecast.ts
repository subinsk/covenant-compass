// Headroom over time for one covenant, and a simple trend-based forecast of
// when it might breach.

import { applicableLimit, testCovenant, type CovenantTerms } from './test'

export type Point = { periodEnd: string, value: number }

export type HeadroomPoint = {
    periodEnd: string
    value: number
    applicableLimit: number
    headroom: number
    headroomPct: number
    compliant: boolean
}

export type Projection = {
    periodEnd: string
    projectedValue: number
    limit: number
    compliant: boolean
}

// A heuristic, not a prediction: a straight line through recent quarters,
// extended forward. It ignores seasonality, one-offs and management action.
export type BreachForecast = {
    // Slope of the fitted line, in covenant units per quarter.
    trendPerQuarter: number
    projections: Projection[]
    // The first projected quarter that fails the test, if any.
    firstBreach: { periodEnd: string, projectedValue: number, limit: number } | null
    // 'low' with fewer than 4 points or a poor fit (R² < 0.5).
    confidence: 'low' | 'medium'
}

function byDate(points: Point[]): Point[] {
    return [...points].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
}

// Tests every period against the limit in force on its own date, so
// step-downs apply from the right quarter.
export function headroomSeries(points: Point[], terms: CovenantTerms): HeadroomPoint[] {
    return byDate(points).map(({ periodEnd, value }) => {
        const result = testCovenant(terms, value, periodEnd)
        return { periodEnd, value, ...result }
    })
}

function daysInMonth(year: number, month: number): number {
    // month is 1-12; day 0 of the next month is the last day of this one.
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Adds months to a YYYY-MM-DD date. A month-end date stays a month-end date
// (Mar 31 + 3 → Jun 30); other days are clamped to the target month's length.
export function addMonths(date: string, count: number): string {
    const [y, m, d] = date.split('-').map(Number)
    const total = y * 12 + (m - 1) + count
    const year = Math.floor(total / 12)
    const month = (total % 12) + 1
    const last = daysInMonth(year, month)
    const day = d === daysInMonth(y, m) ? last : Math.min(d, last)
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Fits value = a + b·x by ordinary least squares, with x = 0, 1, 2, ... for
// each quarter in order:
//   b = Σ(x - x̄)(y - ȳ) / Σ(x - x̄)²,  a = ȳ - b·x̄
// R² = 1 - SSres / SStot measures how well the line explains the values; a
// perfectly flat series (SStot ≈ 0) counts as a perfect fit.
function fitLine(values: number[]): { intercept: number, slope: number, r2: number } {
    const n = values.length
    const meanX = (n - 1) / 2
    const meanY = values.reduce((sum, y) => sum + y, 0) / n
    let sxy = 0
    let sxx = 0
    for (let x = 0; x < n; x++) {
        sxy += (x - meanX) * (values[x] - meanY)
        sxx += (x - meanX) ** 2
    }
    const slope = sxy / sxx
    const intercept = meanY - slope * meanX
    let ssRes = 0
    let ssTot = 0
    for (let x = 0; x < n; x++) {
        ssRes += (values[x] - (intercept + slope * x)) ** 2
        ssTot += (values[x] - meanY) ** 2
    }
    const r2 = ssTot < 1e-12 ? 1 : 1 - ssRes / ssTot
    return { intercept, slope, r2 }
}

// Projects the next `periodsAhead` quarters from a linear trend over the last
// `lookback` quarterly values, and tests each against the limit in force on
// that quarter's date. Returns null with fewer than 3 points.
export function forecastBreach(
    points: Point[],
    terms: CovenantTerms,
    { periodsAhead = 4, lookback = 8 }: { periodsAhead?: number, lookback?: number } = {},
): BreachForecast | null {
    const recent = byDate(points).slice(-Math.max(lookback, 3))
    if (recent.length < 3) return null

    const { intercept, slope, r2 } = fitLine(recent.map((p) => p.value))
    const projections: Projection[] = []
    let periodEnd = recent[recent.length - 1].periodEnd
    for (let i = 1; i <= periodsAhead; i++) {
        periodEnd = addMonths(periodEnd, 3)
        const projectedValue = intercept + slope * (recent.length - 1 + i)
        const { compliant } = testCovenant(terms, projectedValue, periodEnd)
        projections.push({ periodEnd, projectedValue, limit: applicableLimit(terms, periodEnd), compliant })
    }

    const breach = projections.find((p) => !p.compliant)
    return {
        trendPerQuarter: slope,
        projections,
        firstBreach: breach ? { periodEnd: breach.periodEnd, projectedValue: breach.projectedValue, limit: breach.limit } : null,
        confidence: recent.length < 4 || r2 < 0.5 ? 'low' : 'medium',
    }
}
