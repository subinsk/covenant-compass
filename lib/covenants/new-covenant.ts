export type CovenantFormData = Record<string, string | number | undefined>

export type NewCovenantBody = {
    title: string
    type: string
    frequency: string
    category?: string
    dueRule?: string
    graceDays: number
    importance?: string
    metricFormula?: string
    thresholdCondition?: string
}

export const DEFAULT_COVENANT_TYPE = 'FINANCIAL'
export const DEFAULT_FREQUENCY = 'QUARTERLY'

function text(value: string | number | undefined): string | undefined {
    if (value === undefined) return undefined
    const trimmed = String(value).trim()
    return trimmed === '' ? undefined : trimmed
}

// Maps the Add Covenant form state (seeded from the parse-covenant suggestion)
// to the body POST /api/facilities/[facilityId]/covenants expects.
export function buildCovenantRequestBody(form: CovenantFormData): NewCovenantBody {
    const type = text(form.type) ?? DEFAULT_COVENANT_TYPE
    const graceDays = Number(form.graceDays ?? 0)
    const isFinancial = type === 'FINANCIAL'

    return {
        title: text(form.title) ?? text(form.suggestedTitle) ?? '',
        type,
        frequency: text(form.frequency) ?? DEFAULT_FREQUENCY,
        category: text(form.category),
        dueRule: text(form.dueRule),
        graceDays: Number.isFinite(graceDays) ? Math.max(0, Math.trunc(graceDays)) : 0,
        importance: text(form.importance),
        metricFormula: isFinancial ? text(form.metricFormula) : undefined,
        thresholdCondition: isFinancial ? text(form.thresholdCondition) : undefined,
    }
}
