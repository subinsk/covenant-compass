import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { borrowerScope, isLender } from '@/lib/auth/access'
import { invalidInput } from '@/lib/validation/http'
import { issueInvite } from '@/lib/borrowers/invite'

const inviteSchema = z.object({
    // Defaults to the borrower's contact email.
    email: z.email('Enter a valid email').max(200).optional(),
})

// Invites a portal user for a borrower, or renews the link of a pending invite.
// Returns the new invite link; the old one stops working.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession()
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isLender(session)) {
        return NextResponse.json({ error: 'Only lenders can invite borrower users' }, { status: 403 })
    }

    const parsed = inviteSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return invalidInput(parsed.error)

    const { id } = await params
    // Only borrowers this lender added or lends to.
    const borrower = await prisma.organization.findFirst({
        where: { id, ...borrowerScope(session) },
        select: { id: true, contactEmail: true, contactName: true },
    })
    if (!borrower) {
        return NextResponse.json({ error: 'Borrower not found' }, { status: 404 })
    }

    try {
        const invite = await prisma.$transaction(tx => issueInvite(tx, {
            orgId: borrower.id,
            email: parsed.data.email ?? borrower.contactEmail ?? undefined,
            name: borrower.contactName ?? undefined,
            performedBy: session.userId,
        }))
        if (!invite.ok) {
            return NextResponse.json({ error: invite.error }, { status: invite.status })
        }
        return NextResponse.json({ email: invite.email, path: invite.path, expiresAt: invite.expiresAt }, { status: 201 })
    } catch (e) {
        console.error('Invite borrower user error', e)
        return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }
}
