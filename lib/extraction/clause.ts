import { z } from 'zod'
import { chatJson } from '@/lib/llm/structured'
import { heuristicParse, type CovenantSuggestion } from './clause-rules'
import { directionFromQuote } from './direction'

// Optional text fields: small models often send null or "" instead of leaving them out.
const optionalText = z.string().nullish().transform((v) => v?.trim() || undefined)

export const suggestionSchema = z.object({
    type: z.enum(['FINANCIAL', 'REPORTING', 'GENERAL', 'ESG']),
    frequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'EVENT_DRIVEN']),
    dueRule: z.string(),
    graceDays: z.number().int().min(0),
    importance: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    suggestedTitle: z.string().min(1),
    category: z.string(),
    metricFormula: optionalText,
    thresholdCondition: optionalText,
})

const SYSTEM_PROMPT = [
    'You classify one loan agreement covenant clause. Reply with JSON only:',
    '{"type":"FINANCIAL"|"REPORTING"|"GENERAL"|"ESG","frequency":"ONE_TIME"|"MONTHLY"|"QUARTERLY"|"SEMI_ANNUAL"|"ANNUAL"|"EVENT_DRIVEN",'
        + '"dueRule":string,"graceDays":number,"importance":"HIGH"|"MEDIUM"|"LOW","suggestedTitle":string,"category":string,'
        + '"metricFormula":string,"thresholdCondition":string}',
    'Rules:',
    '- Financial ratio tests are FINANCIAL, importance HIGH. metricFormula uses the defined terms, e.g. "Consolidated Total Debt / Consolidated EBITDA".'
        + ' thresholdCondition is the condition the borrower must meet, e.g. "shall not permit ... to be greater than 4.00 to 1.00" means "<= 4.0".',
    '- Deliverables (financial statements, compliance certificates, budgets) are REPORTING. dueRule like "45 days after quarter end".',
    '- Environmental or social commitments are ESG. Anything else is GENERAL.',
    '- frequency is how often it is tested or due. graceDays is 0 unless the clause gives a cure period.',
    '- Omit metricFormula and thresholdCondition unless type is FINANCIAL.',
].join('\n')

// Small models often invert "shall not permit ... greater than X" into ">= X".
// Flips the operator when the clause wording clearly says which way the test goes.
export function correctThreshold(threshold: string | undefined, clauseText: string) {
    const match = threshold?.match(/^\s*(<=|>=|<|>)\s*(.+)$/)
    if (!match) return threshold
    const direction = directionFromQuote(clauseText)
    const isMax = match[1].startsWith('<')
    if (direction === 'max' && !isMax) return `<= ${match[2]}`
    if (direction === 'min' && isMax) return `>= ${match[2]}`
    return threshold
}

export async function suggestCovenant(clauseText: string): Promise<CovenantSuggestion> {
    const suggestion = await chatJson(suggestionSchema, [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: clauseText },
    ], { temperature: 0 })
    return { ...suggestion, thresholdCondition: correctThreshold(suggestion.thresholdCondition, clauseText) }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// The Add Covenant form waits this long for the model before using keyword rules.
// A CPU-only local model can need more than the 60 s default; set LLM_SUGGEST_TIMEOUT_MS.
export function suggestTimeoutMs(value = process.env.LLM_SUGGEST_TIMEOUT_MS) {
    const ms = Number(value)
    return value && Number.isFinite(ms) && ms > 0 ? ms : 60_000
}

// Uses the LLM when one is configured and falls back to keyword rules on any error or timeout.
export async function suggestWithFallback(
    clauseText: string,
    { timeoutMs = suggestTimeoutMs() }: { timeoutMs?: number } = {},
): Promise<CovenantSuggestion & { source: 'llm' | 'rules' }> {
    if (clauseText.trim() && process.env.LLM_BASE_URL && process.env.LLM_MODEL) {
        try {
            return { ...await withTimeout(suggestCovenant(clauseText), timeoutMs), source: 'llm' }
        } catch (err) {
            console.warn('LLM covenant suggestion failed, using keyword rules:', (err as Error).message)
        }
    }
    return { ...heuristicParse(clauseText), source: 'rules' }
}
