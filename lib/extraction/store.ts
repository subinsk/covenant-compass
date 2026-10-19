import type { Prisma, PrismaClient } from '@prisma/client'
import { pageAt } from '@/lib/agreements/text'
import type { CitedCovenant } from './extract'

export type SaveExtractionInput = {
    facilityId: string
    sourceUrl: string
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
            model: input.model,
            promptChars: input.promptChars,
            createdByUserId: input.userId,
            items: { create: input.covenants.map((c) => extractedCovenantRow(c, input.pageStarts)) },
        },
        include: { items: true },
    })
}
