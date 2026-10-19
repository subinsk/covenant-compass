import { z } from 'zod'
import raw from '@/data/eval/companies.json'

// Ground truth for the eval set: covenant limits and actual ratios that each
// company disclosed in a 10-Q, with links to the filing and its credit agreement.

const covenantSchema = z.object({
    name: z.string(),
    operator: z.enum(['<=', '<', '>=', '>']),
    limit: z.number().positive(),
    actual: z.number().nonnegative().nullable(),
    note: z.string().optional(),
})

const companySchema = z.object({
    ticker: z.string(),
    name: z.string(),
    cik: z.string().regex(/^\d{1,10}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    covenantEbitdaReconciliation: z.boolean(),
    covenants: z.array(covenantSchema).min(1),
    source: z.url(),
    agreements: z.array(z.url()).min(1),
    notes: z.string().optional(),
})

export type EvalCovenant = z.infer<typeof covenantSchema>
export type EvalCompany = z.infer<typeof companySchema>

export const evalCompanies: EvalCompany[] = z.array(companySchema).parse(raw)

export function isCompliant(covenant: Pick<EvalCovenant, 'operator' | 'limit'>, value: number) {
    switch (covenant.operator) {
        case '<=': return value <= covenant.limit
        case '<': return value < covenant.limit
        case '>=': return value >= covenant.limit
        case '>': return value > covenant.limit
    }
}
