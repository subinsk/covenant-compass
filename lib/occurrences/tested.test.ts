import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import { plainTestedValue, ragAfterTest, recordTestSchema, testedTrend } from './tested'

const now = new Date('2026-06-01')
const open = { status: 'PENDING' as const, dueDate: new Date('2026-09-01'), ragStatus: 'GREEN' as const, testPassed: null }

describe('recordTestSchema', () => {
    it('accepts a finite number', () => {
        expect(recordTestSchema.parse({ value: 3.25 })).toEqual({ value: 3.25 })
        expect(recordTestSchema.parse({ value: -0.5 })).toEqual({ value: -0.5 })
    })

    it('rejects strings, missing, non-finite and huge values', () => {
        for (const body of [{ value: '3.2' }, {}, { value: Number.NaN }, { value: Infinity }, { value: 1e12 }, null]) {
            expect(recordTestSchema.safeParse(body).success).toBe(false)
        }
    })
})

describe('ragAfterTest', () => {
    it('makes a breach RED', () => {
        expect(ragAfterTest(open, false, now)).toBe('RED')
    })

    it('leaves the RAG alone on a pass or when the test cannot be evaluated', () => {
        expect(ragAfterTest({ ...open, ragStatus: 'AMBER' }, true, now)).toBe('AMBER')
        expect(ragAfterTest({ ...open, status: 'OVERDUE', ragStatus: 'RED' }, true, now)).toBe('RED')
        expect(ragAfterTest({ ...open, ragStatus: 'RED', testPassed: false }, null, now)).toBe('RED')
    })

    it('clears a RED from an earlier failed test back to what the status implies', () => {
        expect(ragAfterTest({ ...open, ragStatus: 'RED', testPassed: false }, true, now)).toBe('GREEN')
        expect(ragAfterTest({ ...open, ragStatus: 'RED', testPassed: false, dueDate: new Date('2026-06-05') }, true, now)).toBe('AMBER')
        expect(ragAfterTest({ ...open, status: 'OVERDUE', dueDate: new Date('2026-05-01'), ragStatus: 'RED', testPassed: false }, true, now)).toBe('RED')
        expect(ragAfterTest({ ...open, status: 'COMPLETED', ragStatus: 'RED', testPassed: false }, true, now)).toBe('GREEN')
    })
})

describe('plainTestedValue', () => {
    it('turns the Decimal into a number', () => {
        expect(plainTestedValue({ id: 'a', testedValue: new Prisma.Decimal('3.25') })).toEqual({ id: 'a', testedValue: 3.25 })
        expect(plainTestedValue({ id: 'a', testedValue: null })).toEqual({ id: 'a', testedValue: null })
    })
})

describe('testedTrend', () => {
    it('keeps the last tested values per covenant, oldest first', () => {
        const row = (covenantId: string, periodEnd: string, testedValue: number | null) => ({
            covenantId, testedValue, testPassed: testedValue === null ? null : testedValue <= 4,
            periodEndDate: new Date(periodEnd), dueDate: new Date(periodEnd),
        })
        const trend = testedTrend([
            row('lev', '2026-06-30', 4.5),
            row('lev', '2025-12-31', 3.1),
            row('lev', '2026-03-31', 3.6),
            row('lev', '2025-09-30', 2.9),
            row('lev', '2025-06-30', 2.5),
            row('lev', '2026-09-30', null),
            row('cov', '2026-03-31', 1.8),
        ], 4)
        expect(trend.get('lev')!.map(t => t.value)).toEqual([2.9, 3.1, 3.6, 4.5])
        expect(trend.get('lev')!.at(-1)!.passed).toBe(false)
        expect(trend.get('cov')!.map(t => t.value)).toEqual([1.8])
        expect(trend.has('other')).toBe(false)
    })
})
