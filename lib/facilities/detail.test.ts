import { describe, expect, it } from 'vitest'
import { dueLabel, filterSchedule, openObligations, statusCounts, termProgress } from './detail'

const items = [
    { id: '1', covenantId: 'a', status: 'PENDING', dueDate: '2026-03-01' },
    { id: '2', covenantId: 'a', status: 'OVERDUE', dueDate: '2026-01-01' },
    { id: '3', covenantId: 'b', status: 'COMPLETED', dueDate: '2025-12-01' },
    { id: '4', covenantId: 'b', status: 'PENDING', dueDate: '2026-02-01' },
]

describe('filterSchedule', () => {
    it('filters by status and covenant together', () => {
        expect(filterSchedule(items, { status: 'PENDING', covenantId: 'b' }).map(o => o.id)).toEqual(['4'])
    })

    it('returns everything for ALL with no covenant', () => {
        expect(filterSchedule(items, { status: 'ALL', covenantId: null })).toHaveLength(4)
    })
})

describe('statusCounts', () => {
    it('counts per status within the covenant filter', () => {
        expect(statusCounts(items, null)).toEqual({ ALL: 4, PENDING: 2, OVERDUE: 1, COMPLETED: 1, WAIVED: 0 })
        expect(statusCounts(items, 'a')).toEqual({ ALL: 2, PENDING: 1, OVERDUE: 1, COMPLETED: 0, WAIVED: 0 })
    })
})

describe('openObligations', () => {
    it('keeps pending and overdue, earliest first', () => {
        expect(openObligations(items).map(o => o.id)).toEqual(['2', '4', '1'])
    })
})

describe('termProgress', () => {
    it('is the elapsed share of the term, clamped', () => {
        expect(termProgress('2026-01-01', '2026-01-11', new Date('2026-01-06'))).toBe(50)
        expect(termProgress('2026-01-01', '2026-01-11', new Date('2025-06-01'))).toBe(0)
        expect(termProgress('2026-01-01', '2026-01-11', new Date('2027-01-01'))).toBe(100)
    })

    it('treats a zero-length term as complete', () => {
        expect(termProgress('2026-01-01', '2026-01-01', new Date('2025-01-01'))).toBe(100)
    })
})

describe('dueLabel', () => {
    const now = new Date('2026-01-10T12:00:00')

    it('says nothing for closed obligations', () => {
        expect(dueLabel('2026-01-01', 'COMPLETED', now)).toBeNull()
    })

    it('labels overdue, today, soon and later', () => {
        expect(dueLabel(new Date('2026-01-07T00:00:00'), 'OVERDUE', now)).toEqual({ text: '3 days overdue', tone: 'overdue' })
        expect(dueLabel(new Date('2026-01-10T00:00:00'), 'PENDING', now)).toEqual({ text: 'Due today', tone: 'soon' })
        expect(dueLabel(new Date('2026-01-11T00:00:00'), 'PENDING', now)).toEqual({ text: 'Due in 1 day', tone: 'soon' })
        expect(dueLabel(new Date('2026-03-01T00:00:00'), 'PENDING', now)?.tone).toBe('later')
    })

    it('treats a pending obligation past its date as overdue', () => {
        expect(dueLabel(new Date('2026-01-09T00:00:00'), 'PENDING', now)).toEqual({ text: '1 day overdue', tone: 'overdue' })
    })
})
