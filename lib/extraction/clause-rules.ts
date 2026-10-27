import type { CovenantType, Frequency, Importance } from '@prisma/client'

export type CovenantSuggestion = {
    type: CovenantType
    frequency: Frequency
    dueRule: string
    graceDays: number
    importance: Importance
    suggestedTitle: string
    category: string
    metricFormula?: string
    thresholdCondition?: string
}

// Keyword rules used when no LLM is configured or the LLM call fails.
export function heuristicParse(text: string): CovenantSuggestion {
    const lower = text.toLowerCase()

    // Default suggestion
    const suggestion: CovenantSuggestion = {
        type: 'GENERAL',
        frequency: 'ANNUAL',
        dueRule: '30 days after period end',
        graceDays: 0,
        importance: 'MEDIUM',
        suggestedTitle: 'New Covenant',
        category: 'General'
    }

    // Detect Type
    if (lower.includes('financial') || lower.includes('ratio') || lower.includes('ebitda') || lower.includes('leverage')) {
        suggestion.type = 'FINANCIAL'
        suggestion.category = 'Financials'
        if (lower.includes('leverage')) suggestion.suggestedTitle = 'Leverage Ratio'
        else if (lower.includes('interest')) suggestion.suggestedTitle = 'Interest Coverage'
        else suggestion.suggestedTitle = 'Financial Ratio'
    } else if (lower.includes('deliver') || lower.includes('provide') || lower.includes('report') || lower.includes('statement')) {
        suggestion.type = 'REPORTING'
        suggestion.category = 'Reporting'
        suggestion.suggestedTitle = 'Financial Statements'
    }

    // Detect Frequency
    if (lower.includes('quarter')) suggestion.frequency = 'QUARTERLY'
    else if (lower.includes('month')) suggestion.frequency = 'MONTHLY'
    else if (lower.includes('year') || lower.includes('annual')) suggestion.frequency = 'ANNUAL'

    // Detect Due Days
    const daysMatch = lower.match(/within (\d+) days/)
    if (daysMatch) {
        suggestion.dueRule = `${daysMatch[1]} days after period end`
    }

    // Detect Formula (simple)
    if (suggestion.type === 'FINANCIAL') {
        if (lower.includes('leverage')) {
            suggestion.metricFormula = 'NetDebt / EBITDA'
            suggestion.thresholdCondition = '<= 4.0' // guess
            const numberMatch = lower.match(/exceed (\d+(\.\d+)?)/)
            if (numberMatch) suggestion.thresholdCondition = `<= ${numberMatch[1]}`
        }
    }

    return suggestion
}
