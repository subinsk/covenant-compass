import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility } from '@/lib/auth/access'
import { Prisma } from '@prisma/client'
import { occurrenceQuerySchema } from '@/lib/validation/covenant'
import { invalidInput, queryParams } from '@/lib/validation/http'

// GET /api/facilities/[facilityId]/occurrences
export async function GET(request: Request, { params }: { params: Promise<{ facilityId: string }> }) {
    const { facilityId } = await params
    const session = await getSession()

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const facility = await prisma.facility.findUnique({
        where: { id: facilityId },
        select: { lenderOrgId: true, borrowerOrgId: true }
    })
    if (!facility || !canAccessFacility(session, facility)) {
        return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    const query = occurrenceQuerySchema.safeParse(queryParams(request.url))
    if (!query.success) return invalidInput(query.error)

    const where: Prisma.CovenantOccurrenceWhereInput = { facilityId }
    if (query.data.status) where.status = query.data.status
    if (query.data.ragStatus) where.ragStatus = query.data.ragStatus

    const occurrences = await prisma.covenantOccurrence.findMany({
        where,
        include: {
            covenant: true
        },
        orderBy: { dueDate: 'asc' }
    })

    return NextResponse.json({ occurrences })
}
