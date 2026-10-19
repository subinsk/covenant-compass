import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createFacilitySchema, facilityQuerySchema } from './facility'

const valid = {
    name: 'Term Loan A',
    borrowerOrgId: 'org-123',
    currency: 'usd',
    totalCommitment: 25000000,
    startDate: '2025-01-01',
    endDate: '2030-01-01',
}

describe('createFacilitySchema', () => {
    it('accepts a valid body and normalises it', () => {
        const result = createFacilitySchema.parse(valid)
        expect(result.currency).toBe('USD')
        expect(result.totalCommitment).toBe(25000000)
        expect(result.startDate).toEqual(new Date('2025-01-01'))
        expect(result.endDate).toEqual(new Date('2030-01-01'))
    })

    it('coerces a numeric string commitment', () => {
        expect(createFacilitySchema.parse({ ...valid, totalCommitment: '1500000.50' }).totalCommitment).toBe(1500000.5)
    })

    it('reports each missing required field', () => {
        const result = createFacilitySchema.safeParse({})
        expect(result.success).toBe(false)
        if (!result.success) {
            const { fieldErrors } = z.flattenError(result.error)
            for (const field of ['name', 'borrowerOrgId', 'currency', 'totalCommitment', 'startDate', 'endDate']) {
                expect(fieldErrors).toHaveProperty(field)
            }
        }
    })

    it('rejects wrong types and bad values', () => {
        expect(createFacilitySchema.safeParse({ ...valid, totalCommitment: 'lots' }).success).toBe(false)
        expect(createFacilitySchema.safeParse({ ...valid, totalCommitment: 0 }).success).toBe(false)
        expect(createFacilitySchema.safeParse({ ...valid, currency: 'US Dollar' }).success).toBe(false)
        expect(createFacilitySchema.safeParse({ ...valid, startDate: 'not a date' }).success).toBe(false)
        expect(createFacilitySchema.safeParse({ ...valid, name: 7 }).success).toBe(false)
    })

    it('rejects an end date on or before the start date', () => {
        const result = createFacilitySchema.safeParse({ ...valid, endDate: '2024-12-31' })
        expect(result.success).toBe(false)
        if (!result.success) expect(z.flattenError(result.error).fieldErrors.endDate).toBeDefined()
    })
})

describe('facilityQuerySchema', () => {
    it('accepts no filter or a valid status', () => {
        expect(facilityQuerySchema.parse({})).toEqual({})
        expect(facilityQuerySchema.parse({ status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' })
    })

    it('rejects an unknown status', () => {
        expect(facilityQuerySchema.safeParse({ status: 'CLOSED' }).success).toBe(false)
    })
})
