import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { borrowerScope, isLender } from '@/lib/auth/access'
import { updateBorrowerSchema } from '@/lib/validation/borrower'
import { invalidInput } from '@/lib/validation/http'
import { recordAudit } from '@/lib/audit/record'
import { changedFields } from '@/lib/audit/diff'
import { BORROWER_FIELDS } from '@/lib/borrowers/new-borrower'

// Edits a borrower's details. Changing the contact email doesn't touch the login
// email of a portal user who already exists.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession()
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isLender(session)) {
        return NextResponse.json({ error: 'Only lenders can edit borrowers' }, { status: 403 })
    }

    const parsed = updateBorrowerSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)
    const body = parsed.data

    const { id } = await params
    // Only borrowers this lender added or lends to.
    const before = await prisma.organization.findFirst({ where: { id, ...borrowerScope(session) } })
    if (!before) {
        return NextResponse.json({ error: 'Borrower not found' }, { status: 404 })
    }

    // One borrower per name among the ones this lender can see.
    if (body.name) {
        const clash = await prisma.organization.findFirst({
            where: { ...borrowerScope(session), id: { not: before.id }, name: { equals: body.name, mode: 'insensitive' } },
            select: { id: true },
        })
        if (clash) {
            return NextResponse.json({
                error: 'Invalid input',
                issues: { formErrors: [], fieldErrors: { name: ['A borrower with this name already exists'] } },
            }, { status: 409 })
        }
    }

    try {
        const borrower = await prisma.$transaction(async (tx) => {
            const updated = await tx.organization.update({ where: { id: before.id }, data: body })
            const changes = changedFields(before, updated, BORROWER_FIELDS)
            if (Object.keys(changes).length > 0) {
                await recordAudit(tx, {
                    entityType: 'ORGANIZATION',
                    entityId: updated.id,
                    action: 'UPDATE',
                    userId: session.userId,
                    details: { changes },
                })
            }
            return updated
        })
        return NextResponse.json(borrower)
    } catch (e) {
        console.error('Update borrower error', e)
        return NextResponse.json({ error: 'Failed to update borrower' }, { status: 500 })
    }
}
