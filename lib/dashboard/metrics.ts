type DateLike = Date | string

export type OnTimeInput = { status: string; dueDate: DateLike; completionDate: DateLike | null }

export type OnTimeRate = {
    rate: number | null // whole percent, null when there is nothing to judge yet
    onTime: number
    completed: number
    overdue: number
}

// On-time = COMPLETED with completionDate <= dueDate, out of COMPLETED + OVERDUE.
// WAIVED is left out (the lender approved it) and PENDING isn't decided yet.
export function onTimeRate(occurrences: OnTimeInput[]): OnTimeRate {
    let onTime = 0
    let completed = 0
    let overdue = 0
    for (const o of occurrences) {
        if (o.status === 'OVERDUE') overdue++
        if (o.status !== 'COMPLETED') continue
        completed++
        if (o.completionDate && new Date(o.completionDate) <= new Date(o.dueDate)) onTime++
    }
    const total = completed + overdue
    return { rate: total === 0 ? null : Math.round((onTime / total) * 100), onTime, completed, overdue }
}
