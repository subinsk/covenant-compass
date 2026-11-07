import { z } from 'zod'
import type { ReviewStatus } from '@prisma/client'
import { buildCovenantRequestBody } from '@/lib/covenants/new-covenant'
import { readStepDowns } from '@/lib/covenants/test'
import { createCovenantSchema, type CreateCovenantInput } from '@/lib/validation/covenant'

// Frequencies a financial test can have; one-time and event-driven covenants aren't tested on a schedule.
export const REVIEW_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'] as const
export const OPERATORS = ['<=', '<', '>=', '>'] as const

// Corrections a reviewer makes before approving. Each field is optional and replaces
// what the model extracted. Step-down dates must be real dates, so they can be applied.
export const reviewEditsSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    frequency: z.enum(REVIEW_FREQUENCIES),
    operator: z.enum(OPERATORS),
    limit: z.number().positive('Limit must be above 0'),
    stepDowns: z.array(z.object({
        from: z.iso.date('Step-down dates must be YYYY-MM-DD'),
        limit: z.number().positive('Step-down limits must be above 0'),
    })).max(20),
}).partial()

export type ReviewEdits = z.infer<typeof reviewEditsSchema>

export const reviewActionSchema = z.object({
    // restore puts a rejected item back in the queue.
    action: z.enum(['approve', 'reject', 'restore']),
    // Only used when approving.
    edits: reviewEditsSchema.optional(),
    // Approve even though the facility already has a matching covenant.
    allowDuplicate: z.boolean().optional(),
})

export type ReviewAction = z.infer<typeof reviewActionSchema>['action']

export type ReviewableCovenant = {
    status: ReviewStatus
    name: string
    operator: string
    limit: number
    stepDowns: unknown // Json column: [{ from, limit }]
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

// The status an item must have for the action: pending to approve or reject, rejected to restore.
export function requiredStatus(action: ReviewAction): ReviewStatus {
    return action === 'restore' ? 'REJECTED' : 'PENDING'
}

// Decides what a review does: the new status, and for an approval the covenant to create.
// Only pending items can be reviewed, so approving twice cannot create two covenants.
export function reviewDecision(item: ReviewableCovenant, action: ReviewAction, edits: ReviewEdits = {}): ReviewDecision {
    if (action === 'restore') {
        return item.status === 'REJECTED'
            ? { ok: true, status: 'PENDING', covenant: null }
            : { ok: false, error: item.status === 'PENDING' ? 'Already waiting for review' : 'Only rejected items can be restored' }
    }
    if (item.status !== 'PENDING') {
        return { ok: false, error: `Already ${item.status.toLowerCase()}` }
    }
    if (action === 'reject') return { ok: true, status: 'REJECTED', covenant: null }

    const body = buildCovenantRequestBody({
        title: edits.name ?? item.name,
        type: 'FINANCIAL',
        frequency: edits.frequency ?? 'QUARTERLY',
        metricFormula: formatMetricFormula(item.numerator, item.denominator),
        thresholdCondition: formatThreshold(edits.operator ?? item.operator, edits.limit ?? item.limit),
    })
    const stepDowns = edits.stepDowns ?? readStepDowns(item.stepDowns)
    const covenant = createCovenantSchema.parse({
        ...body,
        description: item.quote,
        // Carried over so tests after a step-down date use the lower limit.
        ...(stepDowns.length > 0 && { stepDowns }),
    })
    return { ok: true, status: 'APPROVED', covenant }
}
