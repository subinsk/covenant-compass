import { describe, expect, it } from 'vitest'
import { needsAttention, onTimeRate, rankNeedsAttention } from './metrics'

const due = new Date('2026-03-31T00:00:00Z')
const occ = (status: string, completionDate: Date | string | null = null) => ({ status, dueDate: due, completionDate })

describe('onTimeRate', () => {
    it('is null when nothing is completed or overdue', () => {
        expect(onTimeRate([])).toEqual({ rate: null, onTime: 0, completed: 0, overdue: 0 })
        expect(onTimeRate([occ('PENDING'), occ('WAIVED')]).rate).toBeNull()
    })

    it('counts completions on or before the due date as on time', () => {
        const result = onTimeRate([occ('COMPLETED', '2026-03-31T00:00:00Z'), occ('COMPLETED', '2026-03-01T00:00:00Z')])
        expect(result).toEqual({ rate: 100, onTime: 2, completed: 2, overdue: 0 })
    })

    it('counts late completions and overdue items against the rate', () => {
        const result = onTimeRate([
            occ('COMPLETED', '2026-03-01T00:00:00Z'),
            occ('COMPLETED', '2026-04-02T00:00:00Z'),
            occ('OVERDUE'),
        ])
        expect(result).toEqual({ rate: 33, onTime: 1, completed: 2, overdue: 1 })
    })

    it('excludes waived and pending obligations from the denominator', () => {
        const result = onTimeRate([occ('COMPLETED', '2026-03-01T00:00:00Z'), occ('OVERDUE'), occ('WAIVED'), occ('PENDING')])
        expect(result.rate).toBe(50)
    })

    it('does not count a completion without a date as on time', () => {
        expect(onTimeRate([occ('COMPLETED', null)])).toEqual({ rate: 0, onTime: 0, completed: 1, overdue: 0 })
    })
})

describe('needsAttention', () => {
    it('flags open red and overdue obligations only', () => {
        expect(needsAttention({ status: 'OVERDUE', ragStatus: 'RED' })).toBe(true)
        expect(needsAttention({ status: 'OVERDUE', ragStatus: 'AMBER' })).toBe(true)
        expect(needsAttention({ status: 'PENDING', ragStatus: 'RED' })).toBe(true)
        expect(needsAttention({ status: 'PENDING', ragStatus: 'AMBER' })).toBe(false)
        expect(needsAttention({ status: 'COMPLETED', ragStatus: 'RED' })).toBe(false)
        expect(needsAttention({ status: 'WAIVED', ragStatus: 'RED' })).toBe(false)
    })
})

describe('rankNeedsAttention', () => {
    const o = (status: string, ragStatus: string, dueDate = '2026-03-31') => ({ status, ragStatus, dueDate })
    const facility = (name: string, occurrences: ReturnType<typeof o>[], status = 'ACTIVE') => ({ name, status, occurrences })

    it('skips inactive facilities and facilities without current problems', () => {
        const result = rankNeedsAttention([
            facility('Matured', [o('OVERDUE', 'RED')], 'MATURED'),
            facility('Historic', [o('COMPLETED', 'RED'), o('WAIVED', 'RED')]),
            facility('Live', [o('PENDING', 'RED'), o('COMPLETED', 'RED')]),
        ])
        expect(result.map(f => [f.name, f.openRed])).toEqual([['Live', 1]])
    })

    it('ranks by open red count, then oldest overdue due date, then name', () => {
        const result = rankNeedsAttention([
            facility('B', [o('OVERDUE', 'RED', '2026-02-01')]),
            facility('A', [o('PENDING', 'RED')]),
            facility('C', [o('OVERDUE', 'RED', '2026-01-01')]),
            facility('D', [o('OVERDUE', 'RED', '2026-05-01'), o('PENDING', 'RED')]),
            facility('E', [o('PENDING', 'RED')]),
        ])
        expect(result.map(f => f.name)).toEqual(['D', 'C', 'B', 'A', 'E'])
        expect(result[0].oldestOverdue).toEqual(new Date('2026-05-01'))
        expect(result[3].oldestOverdue).toBeNull()
    })

    it('returns at most the limit', () => {
        const many = Array.from({ length: 7 }, (_, i) => facility(`F${i}`, [o('OVERDUE', 'RED')]))
        expect(rankNeedsAttention(many)).toHaveLength(5)
        expect(rankNeedsAttention(many, 2)).toHaveLength(2)
    })
})
