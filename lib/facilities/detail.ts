import { differenceInCalendarDays } from 'date-fns'

type DateLike = Date | string

// Helpers for the facility detail page: schedule filtering, counts and labels.

export const SCHEDULE_STATUSES = ['PENDING', 'OVERDUE', 'COMPLETED', 'WAIVED'] as const
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number]
export type ScheduleFilter = { status: ScheduleStatus | 'ALL'; covenantId: string | null }

type ScheduleItem = { status: string; covenantId: string; dueDate: DateLike }

export function filterSchedule<T extends ScheduleItem>(items: T[], filter: ScheduleFilter): T[] {
    return items.filter(o =>
        (filter.status === 'ALL' || o.status === filter.status) &&
        (!filter.covenantId || o.covenantId === filter.covenantId)
    )
}

// Counts per status (plus ALL), within the covenant filter, for the status chips.
export function statusCounts(items: ScheduleItem[], covenantId: string | null): Record<ScheduleStatus | 'ALL', number> {
    const counts = { ALL: 0, PENDING: 0, OVERDUE: 0, COMPLETED: 0, WAIVED: 0 }
    for (const o of items) {
        if (covenantId && o.covenantId !== covenantId) continue
        counts.ALL++
        if (o.status in counts) counts[o.status as ScheduleStatus]++
    }
    return counts
}

// Open obligations (pending or overdue), earliest due first.
export function openObligations<T extends ScheduleItem>(items: T[]): T[] {
    return items
        .filter(o => o.status === 'PENDING' || o.status === 'OVERDUE')
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
}

// How far through its term a facility is, as a whole percent clamped to 0–100.
export function termProgress(start: DateLike, end: DateLike, now: Date): number {
    const total = new Date(end).getTime() - new Date(start).getTime()
    if (total <= 0) return 100
    const elapsed = now.getTime() - new Date(start).getTime()
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
}

// Short relative label for an open obligation's due date; null once it's closed.
export function dueLabel(dueDate: DateLike, status: string, now: Date): { text: string; tone: 'overdue' | 'soon' | 'later' } | null {
    if (status !== 'PENDING' && status !== 'OVERDUE') return null
    const days = differenceInCalendarDays(new Date(dueDate), now)
    if (status === 'OVERDUE' || days < 0) {
        const late = Math.max(0, -days)
        return { text: late === 0 ? 'Overdue' : `${late} ${late === 1 ? 'day' : 'days'} overdue`, tone: 'overdue' }
    }
    if (days === 0) return { text: 'Due today', tone: 'soon' }
    return { text: `Due in ${days} ${days === 1 ? 'day' : 'days'}`, tone: days <= 14 ? 'soon' : 'later' }
}
