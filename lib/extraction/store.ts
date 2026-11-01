import type { Prisma, PrismaClient } from '@prisma/client'
import { pageAt } from '@/lib/agreements/text'
import type { CitedCovenant } from './extract'
import type { ExtractionStage } from './import'

export type SaveExtractionInput = {
    facilityId: string
    // An EDGAR URL, or the file name for an uploaded agreement
    sourceUrl?: string
    sourceName?: string
    model: string
    promptChars: number
    covenants: CitedCovenant[]
    pageStarts: number[]
    userId?: string
}

// Only the client method used, so tests can pass a small fake.
export type ExtractionStore = {
    extractionRun: Pick<PrismaClient['extractionRun'], 'create'>
}

// Maps one extracted covenant to an ExtractedCovenant row (pending review).
export function extractedCovenantRow(c: CitedCovenant, pageStarts: number[]): Prisma.ExtractedCovenantCreateWithoutRunInput {
    return {
        name: c.name,
        metric: c.metric,
        operator: c.operator,
        limit: c.limit,
        stepDowns: c.stepDowns?.length ? c.stepDowns : undefined,
        numerator: c.numerator,
        denominator: c.denominator,
        quote: c.quote,
        citationStart: c.citation?.start,
        citationEnd: c.citation?.end,
        page: c.citation && pageStarts.length > 0 ? pageAt(c.citation.start, pageStarts) : undefined,
        verified: c.verified,
        limitInQuote: c.limitInQuote,
        operatorCorrected: c.operatorCorrected,
        directionConflict: c.directionConflict,
    }
}

// Saves one extraction run and its covenants. Returns the run with its items.
export function saveExtraction(prisma: ExtractionStore, input: SaveExtractionInput) {
    return prisma.extractionRun.create({
        data: {
            facilityId: input.facilityId,
            sourceUrl: input.sourceUrl,
            sourceName: input.sourceName,
            model: input.model,
            promptChars: input.promptChars,
            createdByUserId: input.userId,
            items: { create: input.covenants.map((c) => extractedCovenantRow(c, input.pageStarts)) },
        },
        include: { items: true },
    })
}

export type RunUpdateStore = {
    extractionRun: Pick<PrismaClient['extractionRun'], 'update'>
}

// Saves the covenants onto a run that was started earlier and marks it done.
export function completeRun(
    prisma: RunUpdateStore,
    runId: string,
    input: Pick<SaveExtractionInput, 'promptChars' | 'covenants' | 'pageStarts'>,
) {
    return prisma.extractionRun.update({
        where: { id: runId },
        data: {
            status: 'DONE',
            promptChars: input.promptChars,
            items: { create: input.covenants.map((c) => extractedCovenantRow(c, input.pageStarts)) },
        },
    })
}

export function setRunStage(prisma: RunUpdateStore, runId: string, stage: ExtractionStage) {
    return prisma.extractionRun.update({ where: { id: runId }, data: { stage } })
}

export function failRun(prisma: RunUpdateStore, runId: string, error: string) {
    return prisma.extractionRun.update({ where: { id: runId }, data: { status: 'FAILED', error } })
}

// A run still RUNNING this long after it started has stopped: the routes allow 300 seconds
// (maxDuration), so it timed out or the server restarted before it could finish.
export const STALE_RUN_MS = 15 * 60 * 1000
export const STALE_RUN_ERROR = 'Extraction timed out or the server restarted. Try again.'
export const RUN_IN_PROGRESS_ERROR = 'An extraction is already running for this facility. Wait for it to finish before starting another.'

export function isStaleRun(run: { status: string, createdAt: Date }, now: Date) {
    return run.status === 'RUNNING' && now.getTime() - run.createdAt.getTime() > STALE_RUN_MS
}

export type StaleRunStore = {
    extractionRun: Pick<PrismaClient['extractionRun'], 'updateMany'>
}

// Marks stale runs (only those matching `where`, if given) as failed.
export function failStaleRuns(prisma: StaleRunStore, now: Date, where: Prisma.ExtractionRunWhereInput = {}) {
    return prisma.extractionRun.updateMany({
        where: { ...where, status: 'RUNNING', createdAt: { lt: new Date(now.getTime() - STALE_RUN_MS) } },
        data: { status: 'FAILED', error: STALE_RUN_ERROR },
    })
}

export type ActiveRunStore = {
    extractionRun: Pick<PrismaClient['extractionRun'], 'updateMany' | 'findFirst'>
}

// The facility's run that is still in progress, if any. Stale runs are failed first, so they
// don't block a new import.
export async function findActiveRun(prisma: ActiveRunStore, facilityId: string, now: Date) {
    await failStaleRuns(prisma, now, { facilityId })
    return prisma.extractionRun.findFirst({ where: { facilityId, status: 'RUNNING' }, select: { id: true } })
}
