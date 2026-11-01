import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { FACILITY_EDIT_FIELDS, updateFacilitySchema } from '@/lib/validation/facility'
import { invalidInput } from '@/lib/validation/http'
import { recordAudit } from '@/lib/audit/record'
import { changedFields } from '@/lib/audit/diff'

// Edits a facility's details or status. The borrower can't change.
export async function PATCH(request: Request, { params }: { params: Promise<{ facilityId: string }> }) {
    const session = await getSession()
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isLender(session)) {
        return NextResponse.json({ error: 'Only lenders can edit facilities' }, { status: 403 })
    }

    const parsed = updateFacilitySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)
    const body = parsed.data

    const { facilityId } = await params
    const before = await prisma.facility.findUnique({ where: { id: facilityId } })
    if (!before || !canAccessFacility(session, before)) {
        return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    // With only one date sent, check it against the stored other one.
    const startDate = body.startDate ?? before.startDate
    const endDate = body.endDate ?? before.endDate
    if (endDate <= startDate) {
        return NextResponse.json({
            error: 'Invalid input',
            issues: { formErrors: [], fieldErrors: { endDate: ['End date must be after start date'] } },
        }, { status: 400 })
    }

    try {
        const facility = await prisma.$transaction(async (tx) => {
            const updated = await tx.facility.update({
                where: { id: before.id },
                data: { ...body, updatedByUserId: session.userId },
            })
            const changes = changedFields(before, updated, FACILITY_EDIT_FIELDS)
            if (Object.keys(changes).length > 0) {
                await recordAudit(tx, {
                    entityType: 'FACILITY',
                    entityId: updated.id,
                    action: 'UPDATE',
                    userId: session.userId,
                    details: { changes },
                })
            }
            return updated
        })
        return NextResponse.json({ ...facility, totalCommitment: facility.totalCommitment.toString() })
    } catch (e) {
        console.error('Update facility error', e)
        return NextResponse.json({ error: 'Failed to update facility' }, { status: 500 })
    }
}
