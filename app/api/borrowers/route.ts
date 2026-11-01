import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { borrowerScope, isLender } from '@/lib/auth/access'
import { createBorrowerSchema } from '@/lib/validation/borrower'
import { invalidInput } from '@/lib/validation/http'
import { recordAudit } from '@/lib/audit/record'
import { issueInvite } from '@/lib/borrowers/invite'

// Adds a borrower organization owned by the signed-in lender's org. With a contact
// email, it also invites that contact as the borrower's portal user and returns the link.
export async function POST(request: Request) {
    const session = await getSession()
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isLender(session)) {
        return NextResponse.json({ error: 'Only lenders can add borrowers' }, { status: 403 })
    }

    const parsed = createBorrowerSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)
    const body = parsed.data

    // One borrower per name among the ones this lender can see.
    const existing = await prisma.organization.findFirst({
        where: { ...borrowerScope(session), name: { equals: body.name, mode: 'insensitive' } },
        select: { id: true },
    })
    if (existing) {
        return NextResponse.json({
            error: 'Invalid input',
            issues: { formErrors: [], fieldErrors: { name: ['A borrower with this name already exists'] } },
        }, { status: 409 })
    }

    try {
        const { created, invite } = await prisma.$transaction(async (tx) => {
            const created = await tx.organization.create({
                data: { ...body, type: 'BORROWER', createdByOrgId: session.orgId },
            })
            await recordAudit(tx, {
                entityType: 'ORGANIZATION',
                entityId: created.id,
                action: 'CREATE',
                userId: session.userId,
                details: { name: created.name, type: 'BORROWER' },
            })
            const invite = created.contactEmail
                ? await issueInvite(tx, {
                    orgId: created.id, email: created.contactEmail, name: created.contactName ?? undefined, performedBy: session.userId,
                })
                : null
            return { created, invite }
        })
        return NextResponse.json({
            ...created,
            invite: invite?.ok ? { email: invite.email, path: invite.path, expiresAt: invite.expiresAt } : null,
            // The borrower is still added when the invite can't be (e.g. the email is taken).
            inviteError: invite && !invite.ok ? invite.error : undefined,
        }, { status: 201 })
    } catch (e) {
        console.error('Create borrower error', e)
        return NextResponse.json({ error: 'Failed to add borrower' }, { status: 500 })
    }
}
