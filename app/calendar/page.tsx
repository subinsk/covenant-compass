import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import CalendarView from './CalendarView'

export default async function CalendarPage() {
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    // In a real app we might filter by range, but for MVP fetching all is fine (< 1000 usually)
    const occurrences = await prisma.covenantOccurrence.findMany({
        where: { facility: facilityScope(session) },
        include: {
            facility: true,
            covenant: true
        },
        orderBy: { dueDate: 'asc' }
    })

    return <CalendarView occurrences={occurrences} />
}
