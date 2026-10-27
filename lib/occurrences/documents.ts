import type { Prisma } from '@prisma/client'

// Evidence fields the facility page passes to the client: plain values only.
export const occurrenceDocumentsSelect = {
    select: { id: true, fileName: true, uploadedAt: true, uploadedBy: { select: { name: true } } },
    orderBy: { uploadedAt: 'asc' },
} satisfies Prisma.CovenantOccurrence$documentsArgs
