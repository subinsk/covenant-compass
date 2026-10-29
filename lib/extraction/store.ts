import type { Prisma, PrismaClient } from '@prisma/client'
import { pageAt } from '@/lib/agreements/text'
import type { CitedCovenant } from './extract'

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

export function failRun(prisma: RunUpdateStore, runId: string, error: string) {
    return prisma.extractionRun.update({ where: { id: runId }, data: { status: 'FAILED', error } })
}
