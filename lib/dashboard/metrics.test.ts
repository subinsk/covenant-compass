import { describe, expect, it } from 'vitest'
import { onTimeRate } from './metrics'

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
