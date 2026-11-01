import type { Prisma } from '@prisma/client'
import { invitePath, newInvite } from '@/lib/auth/invite'
import { recordAudit } from '@/lib/audit/record'

type OrgUser = { id: string; passwordHash: string | null }

export type InvitePlan =
    | { action: 'regenerate'; userId: string }
    | { action: 'create'; email: string }
    | { action: 'refuse'; status: 400 | 409; error: string }

// What inviting a portal user for a borrower should do, given the borrower's users and
// whether the email already belongs to someone. A pending invite gets a new link; an
// email that's taken is never reused.
export function planInvite({ orgUsers, email, emailTaken }: {
    orgUsers: OrgUser[]
    email: string | undefined
    emailTaken: boolean
}): InvitePlan {
    if (orgUsers.some(u => u.passwordHash)) {
        return { action: 'refuse', status: 409, error: 'This borrower already has an active portal user.' }
    }
    const pending = orgUsers.find(u => !u.passwordHash)
    if (pending) return { action: 'regenerate', userId: pending.id }
    if (!email) return { action: 'refuse', status: 400, error: 'Enter an email to invite.' }
    if (emailTaken) return { action: 'refuse', status: 409, error: 'A user with this email already exists, so no invite was created.' }
    return { action: 'create', email }
}

export type InviteResult =
    | { ok: true; email: string; path: string; expiresAt: Date }
    | { ok: false; status: 400 | 409; error: string }

// Creates (or renews) the pending borrower user for an org and returns the invite link.
// The caller must already have checked the lender may see this borrower.
export async function issueInvite(tx: Prisma.TransactionClient, { orgId, email, name, performedBy, now = new Date() }: {
    orgId: string
    email?: string
    name?: string
    performedBy: string
    now?: Date
}): Promise<InviteResult> {
    const normalized = email?.trim().toLowerCase() || undefined
    const [orgUsers, emailOwner] = await Promise.all([
        tx.user.findMany({ where: { organizationId: orgId }, select: { id: true, passwordHash: true } }),
        normalized
            ? tx.user.findFirst({ where: { email: { equals: normalized, mode: 'insensitive' } }, select: { id: true } })
            : null,
    ])
    const plan = planInvite({ orgUsers, email: normalized, emailTaken: !!emailOwner })
    if (plan.action === 'refuse') return { ok: false, status: plan.status, error: plan.error }

    const invite = newInvite(now)
    const data = { inviteTokenHash: invite.tokenHash, inviteExpiresAt: invite.expiresAt }
    const user = plan.action === 'regenerate'
        ? await tx.user.update({ where: { id: plan.userId }, data, select: { id: true, email: true } })
        : await tx.user.create({
            data: { ...data, email: plan.email, name: name?.trim() || '', role: 'BORROWER_USER', organizationId: orgId },
            select: { id: true, email: true },
        })

    await recordAudit(tx, {
        entityType: 'ORGANIZATION',
        entityId: orgId,
        action: 'INVITE',
        userId: performedBy,
        details: { userId: user.id, email: user.email, renewed: plan.action === 'regenerate' },
    })
    return { ok: true, email: user.email, path: invitePath(invite.token), expiresAt: invite.expiresAt }
}

export type PortalAccess =
    | { status: 'NONE' }
    | { status: 'INVITED'; email: string; expired: boolean }
    | { status: 'ACTIVE' }

// A borrower's portal status for the Borrowers page.
export function portalAccess(
    users: { email: string; passwordHash: string | null; inviteExpiresAt: Date | null }[],
    now = new Date(),
): PortalAccess {
    if (users.some(u => u.passwordHash)) return { status: 'ACTIVE' }
    const pending = users[0]
    if (!pending) return { status: 'NONE' }
    return { status: 'INVITED', email: pending.email, expired: !pending.inviteExpiresAt || pending.inviteExpiresAt <= now }
}
