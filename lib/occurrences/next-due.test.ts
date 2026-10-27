import { describe, expect, it } from 'vitest'
import { nextDueByCovenant } from './next-due'

describe('nextDueByCovenant', () => {
    it('picks the earliest open obligation per covenant', () => {
        const result = nextDueByCovenant([
            { covenantId: 'a', status: 'PENDING', dueDate: '2026-12-31' },
            { covenantId: 'a', status: 'PENDING', dueDate: '2026-11-30' },
            { covenantId: 'b', status: 'PENDING', dueDate: new Date('2027-01-31') },
        ])
        expect(result.get('a')).toEqual({ dueDate: new Date('2026-11-30'), overdue: false })
        expect(result.get('b')).toEqual({ dueDate: new Date('2027-01-31'), overdue: false })
    })

    it('flags an overdue obligation, which comes before later pending ones', () => {
        const result = nextDueByCovenant([
            { covenantId: 'a', status: 'PENDING', dueDate: '2026-11-30' },
            { covenantId: 'a', status: 'OVERDUE', dueDate: '2026-08-31' },
        ])
        expect(result.get('a')).toEqual({ dueDate: new Date('2026-08-31'), overdue: true })
    })

    it('ignores completed and waived obligations', () => {
        const result = nextDueByCovenant([
            { covenantId: 'a', status: 'COMPLETED', dueDate: '2026-01-31' },
            { covenantId: 'a', status: 'WAIVED', dueDate: '2026-02-28' },
        ])
        expect(result.has('a')).toBe(false)
    })
})
