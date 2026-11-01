import { describe, expect, it } from 'vitest'
import { isEvidenceReceived, obligationWhere, parseObligationFilter } from './filters'

describe('parseObligationFilter', () => {
    it('accepts known filters', () => {
        expect(parseObligationFilter('overdue')).toBe('overdue')
        expect(parseObligationFilter('closed')).toBe('closed')
        expect(parseObligationFilter('evidence')).toBe('evidence')
    })

    it('falls back to upcoming for missing or unknown values', () => {
        expect(parseObligationFilter(undefined)).toBe('upcoming')
        expect(parseObligationFilter('toString')).toBe('upcoming')
        expect(parseObligationFilter(['overdue'])).toBe('upcoming')
    })
})

describe('obligationWhere', () => {
    const scope = { lenderOrgId: 'org-1' }
    const now = new Date('2026-01-01T00:00:00Z')

    it('limits upcoming to pending obligations due within 30 days', () => {
        expect(obligationWhere('upcoming', scope, now)).toEqual({
            facility: scope,
            status: 'PENDING',
            dueDate: { gte: now, lte: new Date('2026-01-31T00:00:00Z') },
        })
    })

    it('lists closed as the on-time denominator: completed and overdue, not waived', () => {
        expect(obligationWhere('closed', scope, now)).toEqual({ facility: scope, status: { in: ['COMPLETED', 'OVERDUE'] } })
    })

    it('lists evidence awaiting review: open obligations with at least one document', () => {
        expect(obligationWhere('evidence', scope, now)).toEqual({
            facility: scope,
            status: { in: ['PENDING', 'OVERDUE'] },
            documents: { some: {} },
        })
    })

    it('keeps the facility scope on every filter', () => {
        expect(obligationWhere('overdue', scope, now).facility).toBe(scope)
        expect(obligationWhere('closed', scope, now).facility).toBe(scope)
        expect(obligationWhere('evidence', scope, now).facility).toBe(scope)
    })
})

describe('isEvidenceReceived', () => {
    const doc = { id: 'd1' }

    it('is true for pending or overdue obligations with a document', () => {
        expect(isEvidenceReceived({ status: 'PENDING', documents: [doc] })).toBe(true)
        expect(isEvidenceReceived({ status: 'OVERDUE', documents: [doc] })).toBe(true)
    })

    it('is false without documents or once the obligation is closed', () => {
        expect(isEvidenceReceived({ status: 'PENDING', documents: [] })).toBe(false)
        expect(isEvidenceReceived({ status: 'COMPLETED', documents: [doc] })).toBe(false)
        expect(isEvidenceReceived({ status: 'WAIVED', documents: [doc] })).toBe(false)
    })
})
