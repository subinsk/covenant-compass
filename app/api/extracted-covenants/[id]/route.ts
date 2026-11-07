import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/record'
import { requiredStatus, reviewActionSchema, reviewDecision } from '@/lib/extraction/review'
import { generateScheduleForCovenant } from '@/lib/services/schedule-engine'
import { invalidInput } from '@/lib/validation/http'

// PATCH /api/extracted-covenants/[id]  { action: 'approve' | 'reject' | 'restore' }
// Approving creates a Covenant on the run's facility and links it. Restoring puts a
// rejected item back in the queue. Every decision is audited against the facility.
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
    // The covenant and its schedule are built in the same transaction: if the schedule fails,
    // nothing is approved and the item stays pending, so the reviewer can simply try again.
    const result = await prisma.$transaction(async (tx) => {
        const restoring = parsed.data.action === 'restore'
        const claimed = await tx.extractedCovenant.updateMany({
            where: { id, status: requiredStatus(parsed.data.action) },
            data: restoring
                ? { status: decision.status, reviewedByUserId: null, reviewedAt: null }
                : { status: decision.status, reviewedByUserId: session.userId, reviewedAt: new Date() },
        })
        if (claimed.count === 0) return null
        const covenant = decision.covenant
            ? await tx.covenant.create({ data: { ...decision.covenant, facilityId: item.run.facilityId, active: true } })
            : null
        if (covenant) {
            await tx.extractedCovenant.update({ where: { id }, data: { covenantId: covenant.id } })
            await generateScheduleForCovenant(covenant.id, tx)
        }
        await recordAudit(tx, {
            entityType: 'FACILITY',
            entityId: item.run.facilityId,
            action: 'UPDATE',
            userId: session.userId,
            details: { kind: 'review', decision: parsed.data.action, name: item.name, extractedCovenantId: id, covenantId: covenant?.id ?? null },
        })
        return { covenant }
    }).catch((e: unknown) => {
        console.error('Review failed', e)
        return 'failed' as const
    })
    if (result === 'failed') {
        return NextResponse.json({ error: "Couldn't create the covenant's schedule, so nothing was saved. Try again." }, { status: 500 })
    }
    if (!result) return NextResponse.json({ error: 'Already reviewed' }, { status: 409 })

    return NextResponse.json({ status: decision.status, covenantId: result.covenant?.id ?? null })
}
