import type { Prisma } from '@prisma/client'

// Agreement extraction runs shown on a facility page, as plain props for the client.

export type PendingExtractedItem = {
    id: string
    name: string
    metric: string
    operator: string
    limit: number
    page: number | null
    verified: boolean
    quote: string
}

export type AgreementRunView = {
    id: string
    status: 'RUNNING' | 'DONE' | 'FAILED'
    stage: string | null
    error: string | null
    sourceName: string | null
    itemCount: number
    createdAt: string
    items: PendingExtractedItem[]
}

const DAY_MS = 24 * 60 * 60 * 1000

// Runs worth showing: from the last 7 days, still running, done with covenants waiting
// for review, or (from the last 24 hours) failed or done with nothing found.
export function agreementRunsWhere(facilityId: string, now: Date): Prisma.ExtractionRunWhereInput {
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
    const dayAgo = new Date(now.getTime() - DAY_MS)
    return {
        facilityId,
        createdAt: { gte: weekAgo },
        OR: [
            { status: 'RUNNING' },
            { status: 'DONE', items: { some: { status: 'PENDING' } } },
            { status: 'FAILED', createdAt: { gte: dayAgo } },
            { status: 'DONE', items: { none: {} }, createdAt: { gte: dayAgo } },
        ],
    }
}

// What the upload endpoint returns (the new run), as the card's starting state.
export function startedRunView(run: { id: string, status: AgreementRunView['status'], stage: string | null, sourceName: string | null, createdAt: string }): AgreementRunView {
    return { id: run.id, status: run.status, stage: run.stage, error: null, sourceName: run.sourceName, itemCount: 0, createdAt: run.createdAt, items: [] }
}
