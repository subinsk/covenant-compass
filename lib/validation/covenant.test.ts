import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createCovenantSchema, occurrenceQuerySchema } from './covenant'

const valid = {
    title: 'Leverage Ratio',
    type: 'FINANCIAL',
    frequency: 'QUARTERLY',
    dueRule: '45 days after period end',
    metricFormula: 'NetDebt / EBITDA',
    thresholdCondition: '<= 4.0',
}

describe('createCovenantSchema', () => {
    it('accepts a valid body and applies defaults', () => {
        const result = createCovenantSchema.parse(valid)
        expect(result).toMatchObject({ ...valid, graceDays: 0, ownerRole: 'BORROWER', importance: 'MEDIUM' })
    })

    it('rejects a missing or blank title', () => {
        const { title: _title, ...rest } = valid
        void _title
        expect(createCovenantSchema.safeParse(rest).success).toBe(false)
        expect(createCovenantSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false)
    })

    it('rejects the old suggestedTitle field in place of title', () => {
        const { title, ...rest } = valid
        const result = createCovenantSchema.safeParse({ ...rest, suggestedTitle: title })
        expect(result.success).toBe(false)
        if (!result.success) expect(z.flattenError(result.error).fieldErrors.title).toBeDefined()
    })

    it('rejects values outside the Prisma enums', () => {
        expect(createCovenantSchema.safeParse({ ...valid, type: 'OPERATIONAL' }).success).toBe(false)
        expect(createCovenantSchema.safeParse({ ...valid, frequency: 'WEEKLY' }).success).toBe(false)
        expect(createCovenantSchema.safeParse({ ...valid, ownerRole: 'BANK' }).success).toBe(false)
        expect(createCovenantSchema.safeParse({ ...valid, importance: 'CRITICAL' }).success).toBe(false)
    })

    it('coerces numeric strings for graceDays and rejects junk', () => {
        expect(createCovenantSchema.parse({ ...valid, graceDays: '5' }).graceDays).toBe(5)
        expect(createCovenantSchema.safeParse({ ...valid, graceDays: 'abc' }).success).toBe(false)
        expect(createCovenantSchema.safeParse({ ...valid, graceDays: -1 }).success).toBe(false)
        expect(createCovenantSchema.safeParse({ ...valid, graceDays: 1.5 }).success).toBe(false)
    })

    it('rejects wrong types', () => {
        expect(createCovenantSchema.safeParse({ ...valid, title: 42 }).success).toBe(false)
        expect(createCovenantSchema.safeParse({ ...valid, dueRule: ['x'] }).success).toBe(false)
        expect(createCovenantSchema.safeParse(null).success).toBe(false)
    })
})

describe('occurrenceQuerySchema', () => {
    it('accepts no filters or valid filters', () => {
        expect(occurrenceQuerySchema.parse({})).toEqual({})
        expect(occurrenceQuerySchema.parse({ status: 'OVERDUE', ragStatus: 'RED' })).toEqual({ status: 'OVERDUE', ragStatus: 'RED' })
    })

    it('rejects unknown enum values', () => {
        expect(occurrenceQuerySchema.safeParse({ status: 'LATE' }).success).toBe(false)
        expect(occurrenceQuerySchema.safeParse({ ragStatus: 'red' }).success).toBe(false)
    })
})
