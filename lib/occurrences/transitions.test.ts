import { describe, expect, it } from 'vitest'
import { occurrenceActionSchema, openState, transition, type OccurrenceState } from './transitions'

const now = new Date('2026-03-10T12:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000)
const occ = (status: OccurrenceState['status'], dueDate = days(-5), notes: string | null = null): OccurrenceState =>
    ({ status, dueDate, notes })

describe('transition: complete', () => {
    it.each(['PENDING', 'OVERDUE'] as const)('completes a %s obligation', (status) => {
        const result = transition(occ(status), 'complete', now)
        expect(result).toEqual({
            ok: true,
            change: { status: 'COMPLETED', ragStatus: 'GREEN', completionDate: now, notes: null },
        })
    })

    it.each(['COMPLETED', 'WAIVED'] as const)('rejects completing a %s obligation with 409', (status) => {
        expect(transition(occ(status), 'complete', now)).toMatchObject({ ok: false, status: 409 })
    })
})

describe('transition: waive', () => {
    it('waives an overdue obligation and records the reason in notes', () => {
        const result = transition(occ('OVERDUE'), 'waive', now, '  Agreed with borrower  ')
        expect(result).toEqual({
            ok: true,
            change: { status: 'WAIVED', ragStatus: 'GREEN', completionDate: null, notes: 'Waived 2026-03-10: Agreed with borrower' },
        })
    })

    it('appends to existing notes instead of replacing them', () => {
        const result = transition(occ('PENDING', days(3), 'Chased by email'), 'waive', now, 'One-off')
        expect(result.ok && result.change.notes).toBe('Chased by email\nWaived 2026-03-10: One-off')
    })

    it('requires a non-blank reason (400)', () => {
        expect(transition(occ('PENDING'), 'waive', now)).toMatchObject({ ok: false, status: 400 })
        expect(transition(occ('PENDING'), 'waive', now, '   ')).toMatchObject({ ok: false, status: 400 })
    })

    it.each(['COMPLETED', 'WAIVED'] as const)('rejects waiving a %s obligation with 409', (status) => {
        expect(transition(occ(status), 'waive', now, 'why')).toMatchObject({ ok: false, status: 409 })
    })
})

describe('transition: reopen', () => {
    it('reopens a past-due obligation as OVERDUE / RED and clears the completion date', () => {
        const result = transition(occ('COMPLETED', days(-1)), 'reopen', now)
        expect(result).toEqual({ ok: true, change: { status: 'OVERDUE', ragStatus: 'RED', completionDate: null, notes: null } })
    })

    it('reopens an obligation due within 7 days as PENDING / AMBER, keeping notes', () => {
        const result = transition(occ('WAIVED', days(7), 'Waived: x'), 'reopen', now)
        expect(result).toEqual({ ok: true, change: { status: 'PENDING', ragStatus: 'AMBER', completionDate: null, notes: 'Waived: x' } })
    })

    it('reopens a later obligation as PENDING / GREEN', () => {
        expect(transition(occ('COMPLETED', days(30)), 'reopen', now)).toMatchObject({ ok: true, change: { status: 'PENDING', ragStatus: 'GREEN' } })
    })

    it.each(['PENDING', 'OVERDUE'] as const)('rejects reopening a %s obligation with 409', (status) => {
        expect(transition(occ(status), 'reopen', now)).toMatchObject({ ok: false, status: 409 })
    })
})

describe('openState', () => {
    it('treats exactly-now as not yet overdue', () => {
        expect(openState(now, now)).toEqual({ status: 'PENDING', ragStatus: 'AMBER' })
    })
})

describe('occurrenceActionSchema', () => {
    it('accepts known actions and rejects others', () => {
        expect(occurrenceActionSchema.safeParse({ action: 'complete' }).success).toBe(true)
        expect(occurrenceActionSchema.safeParse({ action: 'waive', reason: 'x' }).success).toBe(true)
        expect(occurrenceActionSchema.safeParse({ action: 'delete' }).success).toBe(false)
        expect(occurrenceActionSchema.safeParse(null).success).toBe(false)
    })
})
