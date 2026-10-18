// Share of decided obligations that were completed: completed / (completed + overdue), as a whole percent.
// Returns null when nothing is completed or overdue yet.
export function complianceScore(statuses: string[]): number | null {
    const completed = statuses.filter(s => s === 'COMPLETED').length
    const overdue = statuses.filter(s => s === 'OVERDUE').length
    const total = completed + overdue
    if (total === 0) return null
    return Math.round((completed / total) * 100)
}
