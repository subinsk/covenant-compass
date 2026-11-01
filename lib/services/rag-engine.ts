import { prisma } from '@/lib/prisma'
import { OccurrenceStatus, RagStatus, NotificationType, Prisma } from '@prisma/client'
import { addDays } from 'date-fns'
import { buildPayload, notifyOccurrence } from '@/lib/notifications/notify'

const occurrenceForNotice = {
    covenant: { select: { title: true } },
    facility: { select: { id: true, name: true, lenderOrgId: true, borrowerOrgId: true, createdByUserId: true } },
} satisfies Prisma.CovenantOccurrenceInclude

/**
 * Recalculates RAG status for all pending occurrences.
 * Should be run daily via cron.
 */
export async function updateComplianceStatuses() {
    const now = new Date()

    // 1. PENDING items that are past due -> OVERDUE / RED, and tell both sides once.
    const overdueItems = await prisma.covenantOccurrence.findMany({
        where: {
            status: 'PENDING',
            dueDate: { lt: now }
        },
        include: occurrenceForNotice,
    })

    console.log(`[RAG Engine] Found ${overdueItems.length} overdue items.`)

    for (const item of overdueItems) {
        await prisma.$transaction(async (tx) => {
            const claimed = await tx.covenantOccurrence.updateMany({
                where: { id: item.id, status: 'PENDING' },
                data: { status: OccurrenceStatus.OVERDUE, ragStatus: RagStatus.RED },
            })
            if (claimed.count === 0) return
            // An obligation can go overdue again after a reopen; notify only the first time.
            const alreadyNotified = await tx.notification.findFirst({
                where: { covenantOccurrenceId: item.id, type: NotificationType.OVERDUE },
                select: { id: true },
            })
            if (!alreadyNotified) await notifyOccurrence(tx, NotificationType.OVERDUE, item)
        })
    }

    // 2. Find PENDING items approaching due date (< 7 days) -> Turn to AMBER (if not already amber/red)
    // We only touch them if they are currently GREEN.
    const approachingItems = await prisma.covenantOccurrence.findMany({
        where: {
            status: 'PENDING',
            ragStatus: 'GREEN',
            dueDate: {
                gte: now,
                lte: addDays(now, 7)
            }
        },
        include: occurrenceForNotice,
    })

    console.log(`[RAG Engine] Found ${approachingItems.length} items approaching deadline.`)

    const warningsToCreate: Prisma.NotificationCreateManyInput[] = []
    for (const item of approachingItems) {
        await prisma.covenantOccurrence.update({
            where: { id: item.id },
            data: {
                ragStatus: RagStatus.AMBER
            }
        })

        // Due-soon reminder for the facility creator
        warningsToCreate.push({
            userId: item.facility.createdByUserId,
            type: NotificationType.REMINDER,
            channel: 'IN_APP',
            sentAt: now,
            covenantOccurrenceId: item.id,
            payload: buildPayload(item),
        })
    }

    if (warningsToCreate.length > 0) {
        try {
            await prisma.notification.createMany({ data: warningsToCreate })
        } catch (e) {
            console.error("Failed to create notifications", e)
        }
    }

    return {
        overdueProcessed: overdueItems.length,
        approachingProcessed: approachingItems.length
    }
}
