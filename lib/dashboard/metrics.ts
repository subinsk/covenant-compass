type DateLike = Date | string

export type OnTimeInput = { status: string; dueDate: DateLike; completionDate: DateLike | null }

export type OnTimeRate = {
    rate: number | null // whole percent, null when there is nothing to judge yet
    onTime: number
    completed: number
    overdue: number
}

// Whether one obligation counts as on time: COMPLETED with completionDate <= dueDate is
// on time, any other COMPLETED or OVERDUE is not, and WAIVED or PENDING is undecided (null).
export function isOnTime(o: OnTimeInput): boolean | null {
    if (o.status === 'OVERDUE') return false
    if (o.status !== 'COMPLETED') return null
    return !!o.completionDate && new Date(o.completionDate) <= new Date(o.dueDate)
}

// On-time = COMPLETED with completionDate <= dueDate, out of COMPLETED + OVERDUE.
// WAIVED is left out (the lender approved it) and PENDING isn't decided yet.
export function onTimeRate(occurrences: OnTimeInput[]): OnTimeRate {
    let onTime = 0
    let completed = 0
    let overdue = 0
    for (const o of occurrences) {
        if (o.status === 'OVERDUE') overdue++
        if (o.status === 'COMPLETED') completed++
        if (isOnTime(o)) onTime++
    }
    const total = completed + overdue
    return { rate: total === 0 ? null : Math.round((onTime / total) * 100), onTime, completed, overdue }
}

export type AttentionInput = { status: string; ragStatus: string; dueDate: DateLike }

// A current problem: still open (PENDING or OVERDUE) and either RED or already overdue.
// Completed and waived obligations never count, whatever colour they were.
export function needsAttention(o: { status: string; ragStatus: string }): boolean {
    return o.status === 'OVERDUE' || (o.status === 'PENDING' && o.ragStatus === 'RED')
}

export type RankedFacility<F> = F & { openRed: number; oldestOverdue: Date | null }

// Active facilities with current problems, worst first: most open red items, then the
// oldest overdue due date, then name. Returns at most `limit` facilities.
export function rankNeedsAttention<F extends { name: string; status: string; occurrences: AttentionInput[] }>(
    facilities: F[],
    limit = 5
): RankedFacility<F>[] {
    const ranked: RankedFacility<F>[] = []
    for (const f of facilities) {
        if (f.status !== 'ACTIVE') continue
        const open = f.occurrences.filter(needsAttention)
        if (open.length === 0) continue
        const overdueTimes = open.filter(o => o.status === 'OVERDUE').map(o => new Date(o.dueDate).getTime())
        const oldestOverdue = overdueTimes.length > 0 ? new Date(Math.min(...overdueTimes)) : null
        ranked.push({ ...f, openRed: open.length, oldestOverdue })
    }
    const time = (d: Date | null) => d?.getTime() ?? Infinity
    return ranked
        .sort((a, b) => b.openRed - a.openRed || time(a.oldestOverdue) - time(b.oldestOverdue) || a.name.localeCompare(b.name))
        .slice(0, limit)
}
