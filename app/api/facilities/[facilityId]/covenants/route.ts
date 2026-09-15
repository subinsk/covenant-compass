import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth/jwt'
import { cookies } from 'next/headers'
import { generateScheduleForCovenant } from '@/lib/services/schedule-engine'

// GET /api/facilities/[facilityId]/covenants
export async function GET(request: Request, { params }: { params: Promise<{ facilityId: string }> }) {
    const { facilityId } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    const userPayload = await verifyToken(token || '') as any

    if (!userPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    const userPayload = await verifyToken(token || '') as any

    if (!userPayload || !userPayload.role.includes('LENDER')) {
        return NextResponse.json({ error: 'Unauthorized or Forbidden' }, { status: 403 })
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
