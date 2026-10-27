import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { isoDate, obligationsCsv } from '@/lib/reports/csv'

// GET /api/reports/export: every obligation on the lender's facilities as a CSV download.
export async function GET() {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const occurrences = await prisma.covenantOccurrence.findMany({
        where: { facility: facilityScope(session) },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        select: {
            periodStartDate: true, periodEndDate: true, dueDate: true, status: true, ragStatus: true,
            completionDate: true, notes: true,
            facility: { select: { name: true, borrower: { select: { name: true } } } },
            covenant: { select: { title: true } },
        },
    })

    return new Response(obligationsCsv(occurrences), {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="obligations-${isoDate(new Date())}.csv"`,
            'Cache-Control': 'no-store',
        },
    })
}
