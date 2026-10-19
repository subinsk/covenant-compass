import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { reviewActionSchema, reviewDecision } from '@/lib/extraction/review'
import { generateScheduleForCovenant } from '@/lib/services/schedule-engine'
import { invalidInput } from '@/lib/validation/http'

// PATCH /api/extracted-covenants/[id]  { action: 'approve' | 'reject' }
// Approving creates a Covenant on the run's facility and links it.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const item = await prisma.extractedCovenant.findUnique({
        where: { id },
        include: { run: { select: { facilityId: true, facility: { select: { lenderOrgId: true, borrowerOrgId: true } } } } },
    })
    if (!item || !canAccessFacility(session, item.run.facility)) {
        return NextResponse.json({ error: 'Extracted covenant not found' }, { status: 404 })
    }

    const parsed = reviewActionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)

    const decision = reviewDecision(item, parsed.data.action)
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 409 })

    // Claim the item only while it is still pending, so two concurrent approvals can't both create a covenant.
    const result = await prisma.$transaction(async (tx) => {
        const claimed = await tx.extractedCovenant.updateMany({
            where: { id, status: 'PENDING' },
            data: { status: decision.status, reviewedByUserId: session.userId, reviewedAt: new Date() },
        })
        if (claimed.count === 0) return null
        const covenant = decision.covenant
            ? await tx.covenant.create({ data: { ...decision.covenant, facilityId: item.run.facilityId, active: true } })
            : null
        if (covenant) await tx.extractedCovenant.update({ where: { id }, data: { covenantId: covenant.id } })
        return { covenant }
    })
    if (!result) return NextResponse.json({ error: 'Already reviewed' }, { status: 409 })

    if (result.covenant) await generateScheduleForCovenant(result.covenant.id)
    return NextResponse.json({ status: decision.status, covenantId: result.covenant?.id ?? null })
}
