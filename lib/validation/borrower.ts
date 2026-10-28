import { z } from 'zod'

// Blank strings become undefined so optional fields are stored as null.
const optionalText = (max: number) => z.string().trim().max(max)
    .transform(v => (v === '' ? undefined : v))
    .optional()

export const createBorrowerSchema = z.object({
    name: z.string().trim().min(1, 'Required').max(200),
    legalName: optionalText(200),
    registrationNumber: optionalText(100),
    country: optionalText(100),
    industry: optionalText(100),
    website: optionalText(200),
    contactName: optionalText(200),
    contactEmail: z.string().trim().max(200)
        .transform(v => (v === '' ? undefined : v))
        .pipe(z.email('Enter a valid email').optional())
        .optional(),
    contactPhone: optionalText(50),
    address: optionalText(500),
    notes: optionalText(2000),
})

export type CreateBorrowerInput = z.infer<typeof createBorrowerSchema>
