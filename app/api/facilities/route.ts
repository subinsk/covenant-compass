import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth/jwt'
import { cookies } from 'next/headers'
import { FacilityStatus } from '@prisma/client'

export async function GET(request: Request) {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    const userPayload = await verifyToken(token || '') as any

    if (!userPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get queries
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    // Basic filtering logic based on user role
    const where: any = {}

    if (userPayload.role.includes('LENDER')) {
        // Lender sees facilities where they are the lenderOrg
        where.lenderOrgId = userPayload.orgId
    } else {
        // Borrower sees facilities where they are the borrowerOrg
        where.borrowerOrgId = userPayload.orgId
    }

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
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    const userPayload = await verifyToken(token || '') as any

    if (!userPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only lenders can create facilities (business rule assumption)
    if (!userPayload.role.includes('LENDER')) {
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
                lenderOrgId: userPayload.orgId,
                borrowerOrgId: body.borrowerOrgId,
                currency: body.currency,
                totalCommitment: body.totalCommitment,
                startDate: new Date(body.startDate),
                endDate: new Date(body.endDate),
                status: FacilityStatus.ACTIVE,
                description: body.description,
                createdByUserId: userPayload.userId,
                updatedByUserId: userPayload.userId
            }
        })

        return NextResponse.json(facility)
    } catch (e) {
        console.error("Create facility error", e)
        return NextResponse.json({ error: 'Failed to create facility' }, { status: 500 })
    }
}
