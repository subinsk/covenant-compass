import { z } from 'zod'
import type { AgreementText } from '@/lib/agreements/text'
import type { CitedCovenant } from './extract'

// Only agreements filed on EDGAR can be imported.
export function isEdgarArchiveUrl(value: string): boolean {
    let url: URL
    try {
        url = new URL(value)
    } catch {
        return false
    }
    return url.protocol === 'https:'
        && url.hostname === 'www.sec.gov'
        && url.port === ''
        && url.username === ''
        && url.password === ''
        && url.pathname.startsWith('/Archives/edgar/data/')
}

export const importAgreementSchema = z.object({
    facilityId: z.string().trim().min(1, 'Choose a facility'),
    url: z.string().trim().refine(isEdgarArchiveUrl, 'Must be an https://www.sec.gov/Archives/edgar/data/... URL'),
})

// EDGAR imports also fetch from the SEC, which needs a user agent; uploads only call the LLM.
const REQUIRED_ENV = {
    edgar: ['LLM_BASE_URL', 'LLM_MODEL', 'SEC_USER_AGENT'],
    upload: ['LLM_BASE_URL', 'LLM_MODEL'],
} as const

// Message for the lender when the server can't run extraction, or null when it can.
export function extractionConfigError(env: Record<string, string | undefined>, source: 'edgar' | 'upload'): string | null {
    const missing = REQUIRED_ENV[source].filter((name) => !env[name])
    if (missing.length === 0) return null
    return `Agreement import is not configured on this server (missing ${missing.join(', ')})`
}

export type ExtractionStage = 'READING' | 'EXTRACTING' | 'SAVING'

export type ExtractionSteps = {
    // source is the EDGAR URL, or the file name of an upload
    load: (source: string) => Promise<AgreementText>
    extract: (text: string) => Promise<{ covenants: CitedCovenant[], promptChars: number }>
    complete: (runId: string, result: { covenants: CitedCovenant[], promptChars: number, pageStarts: number[] }) => Promise<unknown>
    fail: (runId: string, error: string) => Promise<unknown>
    // Progress for the UI; if saving it fails, the error is logged and the run carries on.
    onStage?: (runId: string, stage: ExtractionStage) => Promise<unknown>
}

const MAX_ERROR_CHARS = 300

export function shortError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err)
    return message.length > MAX_ERROR_CHARS ? message.slice(0, MAX_ERROR_CHARS - 1) + '…' : message
}

async function reportStage(runId: string, stage: ExtractionStage, steps: ExtractionSteps) {
    if (!steps.onStage) return
    try {
        await steps.onStage(runId, stage)
    } catch (err) {
        console.error(`Could not save stage ${stage} for extraction run ${runId}`, err)
    }
}

// Loads the agreement, extracts covenants and saves them onto a RUNNING run,
// marking it DONE, or FAILED with a short error. Never rejects.
export async function runExtraction(runId: string, source: string, steps: ExtractionSteps): Promise<'DONE' | 'FAILED'> {
    try {
        await reportStage(runId, 'READING', steps)
        const { text, pageStarts } = await steps.load(source)
        await reportStage(runId, 'EXTRACTING', steps)
        const { covenants, promptChars } = await steps.extract(text)
        await reportStage(runId, 'SAVING', steps)
        await steps.complete(runId, { covenants, promptChars, pageStarts })
        return 'DONE'
    } catch (err) {
        try {
            await steps.fail(runId, shortError(err))
        } catch (saveErr) {
            console.error(`Could not mark extraction run ${runId} as failed`, saveErr)
        }
        return 'FAILED'
    }
}
