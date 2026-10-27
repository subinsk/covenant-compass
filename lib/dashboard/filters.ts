import { addDays } from 'date-fns'
import type { Prisma } from '@prisma/client'

// Occurrence filters behind the dashboard KPI cards. The dashboard counts with
// these and /obligations lists with them, so the two always agree.
export const OBLIGATION_FILTERS = {
    upcoming: { label: 'Upcoming (30 days)', description: 'Pending obligations due in the next 30 days.' },
    overdue: { label: 'Overdue Obligations', description: 'Obligations past their due date.' },
    closed: { label: 'Closed Obligations', description: 'Completed, overdue and waived obligations that make up the on-time rate.' },
} as const

export type ObligationFilter = keyof typeof OBLIGATION_FILTERS

export function parseObligationFilter(value: unknown): ObligationFilter {
    return typeof value === 'string' && Object.hasOwn(OBLIGATION_FILTERS, value) ? (value as ObligationFilter) : 'upcoming'
}

export function obligationWhere(
    filter: ObligationFilter,
    scope: Prisma.FacilityWhereInput,
    now: Date
): Prisma.CovenantOccurrenceWhereInput {
    switch (filter) {
        case 'upcoming':
            return { facility: scope, status: 'PENDING', dueDate: { gte: now, lte: addDays(now, 30) } }
        case 'overdue':
            return { facility: scope, status: 'OVERDUE' }
        case 'closed':
            return { facility: scope, status: { in: ['COMPLETED', 'OVERDUE', 'WAIVED'] } }
    }
}
