import { z } from 'zod'
import { CovenantType, Frequency, Importance, OccurrenceStatus, OwnerRole, RagStatus } from '@prisma/client'

const optionalText = z.string().trim().optional()

export const createCovenantSchema = z.object({
    title: z.string().trim().min(1),
    type: z.enum(CovenantType),
    category: optionalText,
    description: optionalText,
    frequency: z.enum(Frequency),
    dueRule: optionalText,
    graceDays: z.coerce.number().int().min(0).default(0),
    ownerRole: z.enum(OwnerRole).default(OwnerRole.BORROWER),
    importance: z.enum(Importance).default(Importance.MEDIUM),
    metricFormula: optionalText,
    thresholdCondition: optionalText,
})

export type CreateCovenantInput = z.infer<typeof createCovenantSchema>

export const occurrenceQuerySchema = z.object({
    status: z.enum(OccurrenceStatus).optional(),
    ragStatus: z.enum(RagStatus).optional(),
})
