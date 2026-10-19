import { z } from 'zod'
import { OrgType } from '@prisma/client'

export const organizationQuerySchema = z.object({
    type: z.enum(OrgType).optional(),
})
