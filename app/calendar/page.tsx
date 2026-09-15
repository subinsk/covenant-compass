import { prisma } from '@/lib/prisma'
import CalendarView from './CalendarView'

export default async function CalendarPage() {
    // Fetch all occurrences for the calendar
    // In a real app we might filter by range, but for MVP fetching all is fine (< 1000 usually)
    const occurrences = await prisma.covenantOccurrence.findMany({
        include: {
            facility: true,
            covenant: true
        },
        orderBy: { dueDate: 'asc' }
    })

    return <CalendarView occurrences={occurrences} />
}
