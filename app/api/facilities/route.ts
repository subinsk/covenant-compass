import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { FacilityStatus, OrgType, Prisma } from '@prisma/client'
import { createFacilitySchema, facilityQuerySchema } from '@/lib/validation/facility'
import { invalidInput, queryParams } from '@/lib/validation/http'
import { recordAudit } from '@/lib/audit/record'

export async function GET(request: Request) {
    const session = await getSession()

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const query = facilityQuerySchema.safeParse(queryParams(request.url))
    if (!query.success) return invalidInput(query.error)

    // Lenders see facilities their org lends on; borrowers, facilities their org borrows on
    const where: Prisma.FacilityWhereInput = facilityScope(session)

    if (query.data.status) {
        where.status = query.data.status
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

    const parsed = createFacilitySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)
    const body = parsed.data

    const borrower = await prisma.organization.findUnique({
        where: { id: body.borrowerOrgId },
        select: { type: true }
    })
    if (!borrower || borrower.type !== OrgType.BORROWER) {
        return NextResponse.json({
            error: 'Invalid input',
            issues: { formErrors: [], fieldErrors: { borrowerOrgId: ['Borrower organization not found'] } }
        }, { status: 400 })
    }

    try {
        const facility = await prisma.$transaction(async (tx) => {
            const created = await tx.facility.create({
                data: {
                    name: body.name,
                    facilityReference: body.facilityReference || `REF-${Date.now()}`,
                    lenderOrgId: session.orgId,
                    borrowerOrgId: body.borrowerOrgId,
                    currency: body.currency,
                    totalCommitment: body.totalCommitment,
                    startDate: body.startDate,
                    endDate: body.endDate,
                    status: FacilityStatus.ACTIVE,
                    description: body.description,
                    createdByUserId: session.userId,
                    updatedByUserId: session.userId
                }
            })
            await recordAudit(tx, {
                entityType: 'FACILITY',
                entityId: created.id,
                action: 'CREATE',
                userId: session.userId,
                details: { name: created.name, borrowerOrgId: created.borrowerOrgId },
            })
            return created
        })

        return NextResponse.json(facility, { status: 201 })
    } catch (e) {
        console.error("Create facility error", e)
        return NextResponse.json({ error: 'Failed to create facility' }, { status: 500 })
    }
}
