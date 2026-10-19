import { z } from 'zod'

// One financial maintenance covenant as extracted from a credit agreement.
// Deliberately lean: the limit, how it is tested, and the sentence that states it.

// Models often send null for fields they can't fill; treat that as absent.
function optional<T extends z.ZodType>(schema: T) {
    return schema.nullish().transform((v) => v ?? undefined)
}

export const metrics = ['leverage', 'secured-leverage', 'net-leverage', 'interest-coverage', 'fixed-charge-coverage', 'other'] as const

export const extractedCovenantSchema = z.object({
    name: z.string().min(1),
    metric: z.enum(metrics),
    // The condition the borrower must satisfy, e.g. '<=' for a maximum leverage ratio.
    operator: z.enum(['<=', '<', '>=', '>']),
    limit: z.number().positive(),
    testFrequency: optional(z.enum(['quarterly', 'annual', 'other'])),
    // Later limits, each with the date or period it applies from.
    stepDowns: optional(z.array(z.object({ from: z.string().min(1), limit: z.number().positive() }))),
    numerator: optional(z.string()),
    denominator: optional(z.string()),
    // Exact sentence(s) from the agreement that state the limit.
    quote: z.string().min(1),
})

export const extractionSchema = z.object({
    covenants: z.array(extractedCovenantSchema),
})

export type ExtractedCovenant = z.infer<typeof extractedCovenantSchema>
