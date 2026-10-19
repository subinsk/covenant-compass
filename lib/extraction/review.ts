import { z } from 'zod'
import type { ReviewStatus } from '@prisma/client'
import { buildCovenantRequestBody } from '@/lib/covenants/new-covenant'
import { createCovenantSchema, type CreateCovenantInput } from '@/lib/validation/covenant'

export const reviewActionSchema = z.object({
    action: z.enum(['approve', 'reject']),
})

export type ReviewAction = z.infer<typeof reviewActionSchema>['action']

export type ReviewableCovenant = {
    status: ReviewStatus
    name: string
    operator: string
    limit: number
    numerator: string | null
    denominator: string | null
    quote: string
}

export type ReviewDecision =
    | { ok: true, status: ReviewStatus, covenant: CreateCovenantInput | null }
    | { ok: false, error: string }

// '<=' and 5.75 -> '<= 5.75'. The limit is printed as stored (3.5, not 3.50).
export function formatThreshold(operator: string, limit: number): string {
    return `${operator} ${limit}`
}

// 'Consolidated Total Debt' and 'Consolidated EBITDA' -> 'Consolidated Total Debt / Consolidated EBITDA'.
export function formatMetricFormula(numerator: string | null, denominator: string | null): string | undefined {
    const top = numerator?.trim()
    const bottom = denominator?.trim()
    if (top && bottom) return `${top} / ${bottom}`
    return top || bottom || undefined
}

// Decides what a review does: the new status, and for an approval the covenant to create.
// Only pending items can be reviewed, so approving twice cannot create two covenants.
export function reviewDecision(item: ReviewableCovenant, action: ReviewAction): ReviewDecision {
    if (item.status !== 'PENDING') {
        return { ok: false, error: `Already ${item.status.toLowerCase()}` }
    }
    if (action === 'reject') return { ok: true, status: 'REJECTED', covenant: null }

    const body = buildCovenantRequestBody({
        title: item.name,
        type: 'FINANCIAL',
        frequency: 'QUARTERLY',
        metricFormula: formatMetricFormula(item.numerator, item.denominator),
        thresholdCondition: formatThreshold(item.operator, item.limit),
    })
    const covenant = createCovenantSchema.parse({ ...body, description: item.quote })
    return { ok: true, status: 'APPROVED', covenant }
}
