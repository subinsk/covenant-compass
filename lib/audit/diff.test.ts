import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import { changedFields } from './diff'

describe('changedFields', () => {
    it('lists only the fields that changed, with before and after', () => {
        expect(changedFields(
            { name: 'Old', currency: 'USD', notes: null },
            { name: 'New', currency: 'USD', notes: 'Hi' },
            ['name', 'currency', 'notes'],
        )).toEqual({
            name: { before: 'Old', after: 'New' },
            notes: { before: null, after: 'Hi' },
        })
    })

    it('compares dates and decimals by value', () => {
        const before = { startDate: new Date('2026-01-01'), totalCommitment: new Prisma.Decimal('1000000') }
        const same = { startDate: new Date('2026-01-01'), totalCommitment: new Prisma.Decimal('1000000') }
        expect(changedFields(before, same, ['startDate', 'totalCommitment'])).toEqual({})

        const after = { startDate: new Date('2026-02-01'), totalCommitment: new Prisma.Decimal('2500000') }
        expect(changedFields(before, after, ['startDate', 'totalCommitment'])).toEqual({
            startDate: { before: '2026-01-01T00:00:00.000Z', after: '2026-02-01T00:00:00.000Z' },
            totalCommitment: { before: '1000000', after: '2500000' },
        })
    })

    it('treats missing and null as the same', () => {
        expect(changedFields({ notes: null }, {}, ['notes'])).toEqual({})
    })

    it('ignores fields not asked for', () => {
        expect(changedFields({ a: 1, b: 1 }, { a: 1, b: 2 }, ['a'])).toEqual({})
    })
})
