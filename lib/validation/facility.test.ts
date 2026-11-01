import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createFacilitySchema, facilityQuerySchema, updateFacilitySchema } from './facility'

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

describe('updateFacilitySchema', () => {
    it('accepts a partial update', () => {
        expect(updateFacilitySchema.parse({ status: 'MATURED' })).toEqual({ status: 'MATURED' })
        expect(updateFacilitySchema.parse({ currency: 'eur', totalCommitment: '5000' })).toEqual({ currency: 'EUR', totalCommitment: 5000 })
        expect(updateFacilitySchema.parse({})).toEqual({})
    })

    it('clears the description when blank', () => {
        expect(updateFacilitySchema.parse({ description: '  ' })).toEqual({ description: null })
    })

    it('rejects a borrower change, an unknown status and blank required fields', () => {
        expect(updateFacilitySchema.safeParse({ borrowerOrgId: 'org-2' }).success).toBe(false)
        expect(updateFacilitySchema.safeParse({ status: 'CLOSED' }).success).toBe(false)
        expect(updateFacilitySchema.safeParse({ name: ' ' }).success).toBe(false)
        expect(updateFacilitySchema.safeParse({ facilityReference: '' }).success).toBe(false)
    })

    it('rejects an end date on or before the start date when both are given', () => {
        const result = updateFacilitySchema.safeParse({ startDate: '2026-01-01', endDate: '2026-01-01' })
        expect(result.success).toBe(false)
        if (!result.success) expect(z.flattenError(result.error).fieldErrors.endDate).toBeDefined()
        expect(updateFacilitySchema.safeParse({ endDate: '2026-01-01' }).success).toBe(true)
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
