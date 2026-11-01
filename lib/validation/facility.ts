import { z } from 'zod'
import { FacilityStatus } from '@prisma/client'

const requiredText = z.string().trim().min(1)
const optionalText = z.string().trim().optional()
const date = z.string().min(1).pipe(z.coerce.date())

const currency = z.string().trim().regex(/^[A-Za-z]{3}$/, 'Expected a 3-letter currency code').transform(c => c.toUpperCase())
const endAfterStart = { message: 'End date must be after start date', path: ['endDate'] }

export const createFacilitySchema = z.object({
    name: requiredText,
    facilityReference: optionalText,
    borrowerOrgId: requiredText,
    currency,
    totalCommitment: z.coerce.number().positive(),
    startDate: date,
    endDate: date,
    description: optionalText,
}).refine(f => f.endDate > f.startDate, endAfterStart)

export type CreateFacilityInput = z.infer<typeof createFacilitySchema>

// Partial update; the borrower can't change, so unknown keys (like borrowerOrgId) are rejected.
// A blank description clears it. The route checks the dates again against the stored ones.
export const updateFacilitySchema = z.strictObject({
    name: requiredText.optional(),
    facilityReference: requiredText.optional(),
    currency: currency.optional(),
    totalCommitment: z.coerce.number().positive().optional(),
    startDate: date.optional(),
    endDate: date.optional(),
    description: z.string().trim().max(5000).transform(v => (v === '' ? null : v)).nullable().optional(),
    status: z.enum(FacilityStatus).optional(),
}).refine(f => !f.startDate || !f.endDate || f.endDate > f.startDate, endAfterStart)

export type UpdateFacilityInput = z.infer<typeof updateFacilitySchema>

export const FACILITY_EDIT_FIELDS = [
    'name', 'facilityReference', 'currency', 'totalCommitment', 'startDate', 'endDate', 'description', 'status',
] as const

export const facilityQuerySchema = z.object({
    status: z.enum(FacilityStatus).optional(),
})
