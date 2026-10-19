import type { ExtractedCovenant } from './schema'

export type Direction = 'max' | 'min'

// Leverage-type ratios are always capped; coverage-type ratios always have a floor.
export function directionFromMetric(metric: ExtractedCovenant['metric']): Direction | null {
    if (metric === 'leverage' || metric === 'secured-leverage' || metric === 'net-leverage') return 'max'
    if (metric === 'interest-coverage' || metric === 'fixed-charge-coverage') return 'min'
    return null
}

// Reads the direction from the covenant's own wording. Agreements usually phrase the test
// as a prohibition ("shall not permit ... to be greater than 5.75"), which small models
// often turn into the wrong operator.
export function directionFromQuote(quote: string): Direction | null {
    const q = quote.toLowerCase().replace(/\s+/g, ' ')
    const prohibited = /\b(shall not|will not|not)\s+(permit|suffer|allow)\b/.test(q)
    const above = /\b(greater than|exceed|exceeds|in excess of|more than|above)\b/.test(q)
    const below = /\b(less than|lower than|below)\b/.test(q)
    if (prohibited) {
        if (above && !below) return 'max'
        if (below && !above) return 'min'
        return null
    }
    if (/\b(not (to )?exceed|no greater than|not (be )?greater than|not more than|at most|maximum)\b/.test(q)) return 'max'
    if (/\b(at least|not less than|no less than|minimum)\b/.test(q)) return 'min'
    return null
}

export function operatorDirection(operator: ExtractedCovenant['operator']): Direction {
    return operator === '<=' || operator === '<' ? 'max' : 'min'
}

// Corrects an operator that contradicts both the metric and the wording (or one of them
// when the other is silent). Leaves it alone when the two signals disagree.
export function checkDirection(covenant: Pick<ExtractedCovenant, 'metric' | 'operator' | 'quote'>): {
    operator: ExtractedCovenant['operator']
    operatorCorrected: boolean
    directionConflict: boolean
} {
    const fromMetric = directionFromMetric(covenant.metric)
    const fromQuote = directionFromQuote(covenant.quote)
    const conflict = fromMetric !== null && fromQuote !== null && fromMetric !== fromQuote
    const expected = conflict ? null : fromMetric ?? fromQuote
    if (!expected || expected === operatorDirection(covenant.operator)) {
        return { operator: covenant.operator, operatorCorrected: false, directionConflict: conflict }
    }
    // A prohibited "greater than X" means "<= X"; a prohibited "less than X" means ">= X".
    return { operator: expected === 'max' ? '<=' : '>=', operatorCorrected: true, directionConflict: false }
}
