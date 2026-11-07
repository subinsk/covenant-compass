import { prisma } from '@/lib/prisma'
import type { SessionPayload } from '@/lib/auth/jwt'
import { canAccessFacility } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/record'
import { readStepDowns, undatedStepDowns } from '@/lib/covenants/test'
import { existingCovenants, findDuplicate } from '@/lib/extraction/duplicates'
import { requiredStatus, reviewDecision, type ReviewAction, type ReviewEdits } from '@/lib/extraction/review'
import { generateScheduleForCovenant } from '@/lib/services/schedule-engine'

export type ReviewRequest = { action: ReviewAction, edits?: ReviewEdits, allowDuplicate?: boolean }

// What the route sends back: an HTTP status and a JSON body.
export type ReviewOutcome = { status: number, body: Record<string, unknown> }

// Applies one review decision for a lender: approve (creating the covenant and its schedule),
// reject or restore. Shared by the single-item route and bulk approval so both follow the same
// rules: access check, duplicate check, one transaction per item, and an audit entry.
export async function applyReview(session: SessionPayload, id: string, request: ReviewRequest): Promise<ReviewOutcome> {
    const item = await prisma.extractedCovenant.findUnique({
        where: { id },
        include: { run: { select: { facilityId: true, facility: { select: { lenderOrgId: true, borrowerOrgId: true } } } } },
    })
    if (!item || !canAccessFacility(session, item.run.facility)) {
        return { status: 404, body: { error: 'Extracted covenant not found' } }
    }

    const decision = reviewDecision(item, request.action, request.edits)
    if (!decision.ok) return { status: 409, body: { error: decision.error } }

    // A second covenant for the same test would double the facility's obligations,
    // so approving one needs an explicit go-ahead.
    if (decision.covenant && !request.allowDuplicate) {
        const existing = (await existingCovenants(prisma, [item.run.facilityId])).get(item.run.facilityId) ?? []
        const duplicate = findDuplicate({ name: decision.covenant.title, metric: item.metric }, existing)
        if (duplicate) {
            return {
                status: 409,
                body: { error: `This facility already has "${duplicate.title}".`, duplicate: { id: duplicate.id, title: duplicate.title } },
            }
        }
    }

    // Claim the item only while it has the expected status, so two concurrent approvals can't both
    // create a covenant. The covenant and its schedule are built in the same transaction: if the
    // schedule fails, nothing is saved and the item keeps its status, so the reviewer can try again.
    const result = await prisma.$transaction(async (tx) => {
        const restoring = request.action === 'restore'
        const claimed = await tx.extractedCovenant.updateMany({
            where: { id, status: requiredStatus(request.action) },
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
            details: {
                kind: 'review', decision: request.action, name: covenant?.title ?? item.name, extractedCovenantId: id, covenantId: covenant?.id ?? null,
                // What the reviewer changed from the extraction, if anything.
                ...(request.action === 'approve' && request.edits && Object.keys(request.edits).length > 0 && { edits: request.edits }),
            },
        })
        return { covenant }
    }).catch((e: unknown) => {
        console.error('Review failed', e)
        return 'failed' as const
    })
    if (result === 'failed') {
        return { status: 500, body: { error: "Couldn't create the covenant's schedule, so nothing was saved. Try again." } }
    }
    if (!result) return { status: 409, body: { error: 'Already reviewed' } }

    return { status: 200, body: { status: decision.status, covenantId: result.covenant?.id ?? null } }
}

// Whether an item is safe to approve without a closer look: the quote was found in the
// agreement, the direction isn't in doubt, and every step-down has a date that can be applied.
// Duplicates are caught by applyReview.
export function approvableInBulk(item: { verified: boolean, directionConflict: boolean, stepDowns: unknown }): boolean {
    return item.verified && !item.directionConflict && undatedStepDowns(readStepDowns(item.stepDowns)).length === 0
}
