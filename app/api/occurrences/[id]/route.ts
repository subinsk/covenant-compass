import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/record'
import { occurrenceActionSchema, transition } from '@/lib/occurrences/transitions'
import { invalidInput } from '@/lib/validation/http'

const AUDIT_ACTION = { complete: 'COMPLETE', waive: 'WAIVE', reopen: 'UPDATE' } as const

// PATCH /api/occurrences/[id]  { action: 'complete' | 'waive' | 'reopen', reason? }
// Lenders mark an obligation complete, waive it (reason required) or reopen it.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const occurrence = await prisma.covenantOccurrence.findUnique({
        where: { id },
        select: {
            id: true, status: true, dueDate: true, notes: true,
            facility: { select: { lenderOrgId: true, borrowerOrgId: true } },
        },
    })
    if (!occurrence || !canAccessFacility(session, occurrence.facility)) {
        return NextResponse.json({ error: 'Obligation not found' }, { status: 404 })
    }

    const parsed = occurrenceActionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)
    const { action, reason } = parsed.data

    const result = transition(occurrence, action, new Date(), reason)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    // Update only while the status is still the one we checked, so concurrent actions can't both apply.
    const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.covenantOccurrence.updateMany({
            where: { id, status: occurrence.status },
            data: result.change,
        })
        if (claimed.count === 0) return false
        await recordAudit(tx, {
            entityType: 'OCCURRENCE',
            entityId: id,
            action: AUDIT_ACTION[action],
            userId: session.userId,
            details: { action, previousStatus: occurrence.status, newStatus: result.change.status, reason: reason?.trim() || null },
        })
        return true
    })
    if (!updated) return NextResponse.json({ error: 'Obligation was changed by someone else. Reload and try again.' }, { status: 409 })

    return NextResponse.json({ id, ...result.change })
}
