import { z } from 'zod'
import type { OccurrenceStatus, RagStatus } from '@prisma/client'

export const occurrenceActionSchema = z.object({
    action: z.enum(['complete', 'waive', 'reopen']),
    reason: z.string().trim().max(1000).optional(),
})

export type OccurrenceAction = z.infer<typeof occurrenceActionSchema>['action']

export type OccurrenceState = {
    status: OccurrenceStatus
    dueDate: Date
    notes: string | null
}

export type OccurrenceChange = {
    status: OccurrenceStatus
    ragStatus: RagStatus
    completionDate: Date | null
    notes: string | null
}

export type TransitionResult =
    | { ok: true; change: OccurrenceChange }
    | { ok: false; status: 400 | 409; error: string }

const DAY_MS = 24 * 60 * 60 * 1000
const OPEN: OccurrenceStatus[] = ['PENDING', 'OVERDUE']
const CLOSED: OccurrenceStatus[] = ['COMPLETED', 'WAIVED']

// Same rule as the nightly RAG job: past due is RED, due within 7 days is AMBER.
export function openState(dueDate: Date, now: Date): { status: OccurrenceStatus; ragStatus: RagStatus } {
    if (dueDate < now) return { status: 'OVERDUE', ragStatus: 'RED' }
    if (dueDate.getTime() - now.getTime() <= 7 * DAY_MS) return { status: 'PENDING', ragStatus: 'AMBER' }
    return { status: 'PENDING', ragStatus: 'GREEN' }
}

// The change a lender action makes to an obligation, or why it isn't allowed.
export function transition(
    occurrence: OccurrenceState,
    action: OccurrenceAction,
    now: Date,
    reason?: string,
): TransitionResult {
    const notAllowed = (): TransitionResult =>
        ({ ok: false, status: 409, error: `Cannot ${action} an obligation that is ${occurrence.status}` })

    if (action === 'complete') {
        if (!OPEN.includes(occurrence.status)) return notAllowed()
        return { ok: true, change: { status: 'COMPLETED', ragStatus: 'GREEN', completionDate: now, notes: occurrence.notes } }
    }

    if (action === 'waive') {
        if (!OPEN.includes(occurrence.status)) return notAllowed()
        const text = reason?.trim()
        if (!text) return { ok: false, status: 400, error: 'A reason is required to waive an obligation' }
        const entry = `Waived ${now.toISOString().slice(0, 10)}: ${text}`
        const notes = occurrence.notes ? `${occurrence.notes}\n${entry}` : entry
        return { ok: true, change: { status: 'WAIVED', ragStatus: 'GREEN', completionDate: null, notes } }
    }

    if (!CLOSED.includes(occurrence.status)) return notAllowed()
    return { ok: true, change: { ...openState(occurrence.dueDate, now), completionDate: null, notes: occurrence.notes } }
}
