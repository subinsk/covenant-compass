import { z } from 'zod'
import { FacilityStatus } from '@prisma/client'

const requiredText = z.string().trim().min(1)
const optionalText = z.string().trim().optional()
const date = z.string().min(1).pipe(z.coerce.date())

export const createFacilitySchema = z.object({
    name: requiredText,
    facilityReference: optionalText,
    borrowerOrgId: requiredText,
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'Expected a 3-letter currency code').transform(c => c.toUpperCase()),
    totalCommitment: z.coerce.number().positive(),
    startDate: date,
    endDate: date,
    description: optionalText,
}).refine(f => f.endDate > f.startDate, { message: 'End date must be after start date', path: ['endDate'] })

export type CreateFacilityInput = z.infer<typeof createFacilitySchema>

export const facilityQuerySchema = z.object({
    status: z.enum(FacilityStatus).optional(),
})
