import { prisma } from '@/lib/prisma'
import { OccurrenceStatus, RagStatus, NotificationType, Prisma } from '@prisma/client'
import { addDays } from 'date-fns'

/**
 * Recalculates RAG status for all pending occurrences.
 * Should be run daily via cron.
 */
export async function updateComplianceStatuses() {
    const now = new Date()
    const warningsToCreate: Prisma.NotificationCreateManyInput[] = []
    const alertsToCreate: Prisma.NotificationCreateManyInput[] = []

    // 1. Find PENDING items that are past due -> Turn to OVERDUE / RED
    const overdueItems = await prisma.covenantOccurrence.findMany({
        where: {
            status: 'PENDING',
            dueDate: { lt: now }
        },
        include: { covenant: true, facility: true }
    })

    console.log(`[RAG Engine] Found ${overdueItems.length} overdue items.`)

    for (const item of overdueItems) {
        // Update item
        await prisma.covenantOccurrence.update({
            where: { id: item.id },
            data: {
                status: OccurrenceStatus.OVERDUE,
                ragStatus: RagStatus.RED
            }
        })

        // Create Alert Notification
        alertsToCreate.push({
            userId: item.facility.createdByUserId, // Notify Facility Creator
            type: NotificationType.OVERDUE,
            channel: 'IN_APP',
            covenantOccurrenceId: item.id,
            payload: {
                title: `Overdue: ${item.covenant.title}`,
                message: `Obligation for ${item.facility.name} was due on ${item.dueDate.toLocaleDateString()}. Status set to RED.`,
                entityId: item.facility.id,
                entityType: 'FACILITY'
            }
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
        include: { covenant: true, facility: true }
    })

    console.log(`[RAG Engine] Found ${approachingItems.length} items approaching deadline.`)

    for (const item of approachingItems) {
        await prisma.covenantOccurrence.update({
            where: { id: item.id },
            data: {
                ragStatus: RagStatus.AMBER
            }
        })

        // Create Warning Notification
        warningsToCreate.push({
            userId: item.facility.createdByUserId,
            type: NotificationType.REMINDER,
            channel: 'IN_APP',
            covenantOccurrenceId: item.id,
            payload: {
                title: `Due Soon: ${item.covenant.title}`,
                message: `Obligation for ${item.facility.name} is due on ${item.dueDate.toLocaleDateString()}. please ensure compliance.`
            }
        })
    }

    // Bulk insert notifications
    const allNotifs = [...alertsToCreate, ...warningsToCreate]

    if (allNotifs.length > 0) {
        // We filter out notifications where userId might be missing (though schema says required on Facility)
        const validNotifs = allNotifs.filter(n => n.userId)

        try {
            await prisma.notification.createMany({
                data: validNotifs
            })
        } catch (e) {
            console.error("Failed to create notifications", e)
        }
    }

    return {
        overdueProcessed: overdueItems.length,
        approachingProcessed: approachingItems.length
    }
}
