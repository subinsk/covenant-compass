import { prisma } from '@/lib/prisma'
import { Covenant, Facility, Frequency, OccurrenceStatus, RagStatus } from '@prisma/client'
import { addMonths, addQuarters, addYears, addDays, startOfDay, isBefore, isAfter } from 'date-fns'

export async function generateScheduleForCovenant(covenantId: string) {
    const covenant = await prisma.covenant.findUnique({
        where: { id: covenantId },
        include: { facility: true }
    })

    if (!covenant) throw new Error('Covenant not found')

    const { facility, frequency } = covenant

    if (frequency === 'ONE_TIME' || frequency === 'EVENT_DRIVEN') {
        // For now, create one pending occurrence due in 30 days or facility end?
        // Let's explicitly NOT create schedule for event driven, user must create occurrence manually? 
        // Or create 1 generic placeholder.
        // For MVP, if ONE_TIME, create 1 occurrence at facility end or now.
        return
    }

    // Generate periodic
    let startDate = startOfDay(new Date(facility.startDate))
    const endDate = startOfDay(new Date(facility.endDate))

    // Logic: Iterate from start date adding frequency until end date
    // For each period, calculate due date based on dueRule (naive parsing for now)

    let currentPeriodStart = startDate

    const occurrencesToCreate = []

    while (isBefore(currentPeriodStart, endDate)) {
        let currentPeriodEnd: Date

        switch (frequency) {
            case 'MONTHLY': currentPeriodEnd = addMonths(currentPeriodStart, 1); break;
            case 'QUARTERLY': currentPeriodEnd = addMonths(currentPeriodStart, 3); break;
            case 'SEMI_ANNUAL': currentPeriodEnd = addMonths(currentPeriodStart, 6); break;
            case 'ANNUAL': currentPeriodEnd = addYears(currentPeriodStart, 1); break;
            default: currentPeriodEnd = addMonths(currentPeriodStart, 1);
        }

        // Adjust end date if it exceeds facility end (though covenants usually align)
        if (isAfter(currentPeriodEnd, endDate)) {
            currentPeriodEnd = endDate
        }

        // Naive due date: Assume dueRule says "X days after period end"
        // We will default to 30 days if parse fails
        let daysAfter = 30
        // Try to parse number from string like "45 days after..."
        const daysMatch = covenant.dueRule?.match(/(\d+)/)
        if (daysMatch) {
            daysAfter = parseInt(daysMatch[1])
        }

        const dueDate = addDays(currentPeriodEnd, daysAfter)

        occurrencesToCreate.push({
            covenantId: covenant.id,
            facilityId: facility.id,
            periodStartDate: currentPeriodStart,
            periodEndDate: addDays(currentPeriodEnd, -1), // inclusive end usually -1 day
            dueDate: dueDate,
            status: OccurrenceStatus.PENDING,
            ragStatus: RagStatus.GREEN
        })

        currentPeriodStart = currentPeriodEnd
    }

    // Bulk create
    if (occurrencesToCreate.length > 0) {
        await prisma.covenantOccurrence.createMany({
            data: occurrencesToCreate
        })
    }

    return occurrencesToCreate.length
}
