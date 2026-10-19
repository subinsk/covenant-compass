import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { generateScheduleForCovenant } from '@/lib/services/schedule-engine'

// GET /api/facilities/[facilityId]/covenants
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

    const covenants = await prisma.covenant.findMany({
        where: { facilityId },
        orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ covenants })
}

// POST /api/facilities/[facilityId]/covenants
export async function POST(request: Request, { params }: { params: Promise<{ facilityId: string }> }) {
    const { facilityId } = await params
    const session = await getSession()

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isLender(session)) {
        return NextResponse.json({ error: 'Unauthorized or Forbidden' }, { status: 403 })
    }

    const facility = await prisma.facility.findUnique({
        where: { id: facilityId },
        select: { lenderOrgId: true, borrowerOrgId: true }
    })
    if (!facility || !canAccessFacility(session, facility)) {
        return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    try {
        const body = await request.json()

        const covenant = await prisma.covenant.create({
            data: {
                facilityId,
                title: body.title,
                type: body.type,
                category: body.category,
                description: body.description,
                frequency: body.frequency,
                dueRule: body.dueRule,
                graceDays: parseInt(body.graceDays || '0'),
                ownerRole: body.ownerRole || 'BORROWER',
                importance: body.importance || 'MEDIUM',
                metricFormula: body.metricFormula,
                thresholdCondition: body.thresholdCondition,
                active: true
            }
        })

        // Trigger Schedule Generation
        await generateScheduleForCovenant(covenant.id)

        return NextResponse.json(covenant)
    } catch (e) {
        console.error(e)
        return NextResponse.json({ error: 'Failed to create covenant' }, { status: 500 })
    }
}
