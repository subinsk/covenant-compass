type DateLike = Date | string

export type NextDue = { dueDate: Date; overdue: boolean }

// Per covenant, the earliest open (PENDING or OVERDUE) obligation's due date.
// Covenants with nothing open are absent from the map.
export function nextDueByCovenant(
    occurrences: { covenantId: string; status: string; dueDate: DateLike }[],
): Map<string, NextDue> {
    const next = new Map<string, NextDue>()
    for (const o of occurrences) {
        if (o.status !== 'PENDING' && o.status !== 'OVERDUE') continue
        const dueDate = new Date(o.dueDate)
        const current = next.get(o.covenantId)
        if (!current || dueDate < current.dueDate) {
            next.set(o.covenantId, { dueDate, overdue: o.status === 'OVERDUE' })
        }
    }
    return next
}
