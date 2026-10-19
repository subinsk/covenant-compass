import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility } from '@/lib/auth/access'
import { OccurrenceStatus, Prisma, RagStatus } from '@prisma/client'

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

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const ragStatus = searchParams.get('ragStatus')

    const where: Prisma.CovenantOccurrenceWhereInput = { facilityId }
    if (status) where.status = status as OccurrenceStatus
    if (ragStatus) where.ragStatus = ragStatus as RagStatus

    const occurrences = await prisma.covenantOccurrence.findMany({
        where,
        include: {
            covenant: true
        },
        orderBy: { dueDate: 'asc' }
    })

    return NextResponse.json({ occurrences })
}
