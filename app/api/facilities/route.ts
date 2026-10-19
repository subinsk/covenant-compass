import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { isLender } from '@/lib/auth/access'
import { FacilityStatus, Prisma } from '@prisma/client'

export async function GET(request: Request) {
    const session = await getSession()

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get queries
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    // Lenders see facilities their org lends on; borrowers, facilities their org borrows on
    const where: Prisma.FacilityWhereInput = isLender(session)
        ? { lenderOrgId: session.orgId }
        : { borrowerOrgId: session.orgId }

    if (status) {
        where.status = status as FacilityStatus
    }

    const facilities = await prisma.facility.findMany({
        where,
        include: {
            lender: { select: { name: true } },
            borrower: { select: { name: true } },
            _count: {
                select: {
                    covenants: true,
                    occurrences: { where: { status: 'OVERDUE' } }
                }
            }
        },
        orderBy: { updatedAt: 'desc' }
    })

    return NextResponse.json({ facilities })
}

export async function POST(request: Request) {
    const session = await getSession()

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only lenders can create facilities (business rule assumption)
    if (!isLender(session)) {
        return NextResponse.json({ error: 'Only lenders can create facilities' }, { status: 403 })
    }

    try {
        const body = await request.json()
        // Basic validation
        if (!body.name || !body.borrowerOrgId || !body.currency || !body.totalCommitment) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const facility = await prisma.facility.create({
            data: {
                name: body.name,
                facilityReference: body.facilityReference || `REF-${Date.now()}`,
                lenderOrgId: session.orgId,
                borrowerOrgId: body.borrowerOrgId,
                currency: body.currency,
                totalCommitment: body.totalCommitment,
                startDate: new Date(body.startDate),
                endDate: new Date(body.endDate),
                status: FacilityStatus.ACTIVE,
                description: body.description,
                createdByUserId: session.userId,
                updatedByUserId: session.userId
            }
        })

        return NextResponse.json(facility)
    } catch (e) {
        console.error("Create facility error", e)
        return NextResponse.json({ error: 'Failed to create facility' }, { status: 500 })
    }
}
