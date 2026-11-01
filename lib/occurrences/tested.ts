import { z } from 'zod'
import type { OccurrenceStatus, Prisma, RagStatus } from '@prisma/client'
import { openState } from './transitions'

// PUT /api/occurrences/[id]/tested-value body: the ratio reported for the period.
export const recordTestSchema = z.object({
    value: z.number().gt(-1e9).lt(1e9),
})

// The RAG after a test. A breach makes the obligation RED. A pass only clears a
// RED that came from an earlier failed test, back to what the status implies;
// otherwise the RAG is left as the schedule set it.
export function ragAfterTest(
    occurrence: { status: OccurrenceStatus; dueDate: Date; ragStatus: RagStatus; testPassed: boolean | null },
    passed: boolean | null,
    now: Date,
): RagStatus {
    if (passed === false) return 'RED'
    if (passed === true && occurrence.testPassed === false) {
        const isOpen = occurrence.status === 'PENDING' || occurrence.status === 'OVERDUE'
        return isOpen ? openState(occurrence.dueDate, now).ragStatus : 'GREEN'
    }
    return occurrence.ragStatus
}

// Prisma's Decimal can't be passed to a client component.
export function plainTestedValue<T extends { testedValue: Prisma.Decimal | null }>(row: T): Omit<T, 'testedValue'> & { testedValue: number | null } {
    return { ...row, testedValue: row.testedValue === null ? null : row.testedValue.toNumber() }
}

type TrendPoint = { value: number; passed: boolean | null }

// The last few tested values per covenant, oldest first, for a small trend.
export function testedTrend(
    occurrences: { covenantId: string; testedValue: number | null; testPassed: boolean | null; periodEndDate: Date | string | null; dueDate: Date | string }[],
    count = 4,
): Map<string, TrendPoint[]> {
    const time = (o: { periodEndDate: Date | string | null; dueDate: Date | string }) => new Date(o.periodEndDate ?? o.dueDate).getTime()
    const tested = occurrences.filter(o => o.testedValue !== null).sort((a, b) => time(a) - time(b))
    const trend = new Map<string, TrendPoint[]>()
    for (const o of tested) {
        const points = [...(trend.get(o.covenantId) ?? []), { value: o.testedValue!, passed: o.testPassed }]
        trend.set(o.covenantId, points.slice(-count))
    }
    return trend
}
