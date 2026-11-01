import type { Prisma } from '@prisma/client'

export const HISTORY_PAGE_SIZE = 50

export type PortalView = 'open' | 'history'

export function parsePortalView(value: unknown): PortalView {
    return value === 'history' ? 'history' : 'open'
}

export function parsePage(value: unknown): number {
    const page = typeof value === 'string' ? Number.parseInt(value, 10) : NaN
    return Number.isFinite(page) && page > 0 ? page : 1
}

// Closed obligations on the borrower's facilities: completed or waived.
export function historyWhere(scope: Prisma.FacilityWhereInput): Prisma.CovenantOccurrenceWhereInput {
    return { facility: scope, status: { in: ['COMPLETED', 'WAIVED'] } }
}

const WAIVER_LINE = /^Waived \d{4}-\d{2}-\d{2}: (.*)$/

// The latest waiver reason in an occurrence's notes. Waiving appends a line
// "Waived YYYY-MM-DD: <reason>" (see lib/occurrences/transitions.ts).
export function waiverReason(notes: string | null): string | null {
    if (!notes) return null
    const reasons = notes.split('\n').flatMap(line => line.match(WAIVER_LINE)?.[1].trim() || [])
    return reasons.at(-1) ?? null
}
