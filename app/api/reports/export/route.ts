import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { isoDate, obligationsCsv } from '@/lib/reports/csv'
import { parseReportParams, reportOrderBy, reportWhere } from '@/lib/reports/list'

// GET /api/reports/export: the lender's obligations as a CSV download. Takes the
// same filters as /reports, so it exports what the page shows (every page of it).
export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const params = parseReportParams(Object.fromEntries(request.nextUrl.searchParams))

    const occurrences = await prisma.covenantOccurrence.findMany({
        where: reportWhere(facilityScope(session), params),
        orderBy: reportOrderBy(params.sort, params.dir),
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
