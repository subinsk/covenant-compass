import { describe, expect, it } from 'vitest'
import { obligationWhere, parseObligationFilter } from './filters'

describe('parseObligationFilter', () => {
    it('accepts known filters', () => {
        expect(parseObligationFilter('overdue')).toBe('overdue')
        expect(parseObligationFilter('closed')).toBe('closed')
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

    it('keeps the facility scope on every filter', () => {
        expect(obligationWhere('overdue', scope, now).facility).toBe(scope)
        expect(obligationWhere('closed', scope, now).facility).toBe(scope)
    })
})
