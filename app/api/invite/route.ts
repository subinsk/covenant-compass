import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { acceptInviteSchema, hashInviteToken, INVITE_STATUS_MESSAGES, inviteStatus } from '@/lib/auth/invite'
import { hashPassword } from '@/lib/auth/password'
import { setSessionCookie } from '@/lib/auth/cookie'
import { invalidInput } from '@/lib/validation/http'
import { recordAudit } from '@/lib/audit/record'

// Public: accepts an invite. Sets the user's name and password, clears the token
// and signs them in.
export async function POST(request: Request) {
    const parsed = acceptInviteSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)
    const { token, name, password } = parsed.data

    const tokenHash = hashInviteToken(token)
    const user = await prisma.user.findFirst({ where: { inviteTokenHash: tokenHash } })
    const status = inviteStatus(user)
    if (!user || status !== 'valid') {
        return NextResponse.json({ error: INVITE_STATUS_MESSAGES[status === 'valid' ? 'invalid' : status] }, { status: 410 })
    }

    const passwordHash = await hashPassword(password)
    try {
        const accepted = await prisma.$transaction(async (tx) => {
            // Matching on the token too means two submits of one link can't both succeed.
            const { count } = await tx.user.updateMany({
                where: { id: user.id, inviteTokenHash: tokenHash, passwordHash: null },
                data: { name, passwordHash, inviteTokenHash: null, inviteExpiresAt: null },
            })
            if (count === 0) return false
            await recordAudit(tx, {
                entityType: 'ORGANIZATION',
                entityId: user.organizationId,
                action: 'ACCEPT_INVITE',
                userId: user.id,
                details: { email: user.email },
            })
            return true
        })
        if (!accepted) {
            return NextResponse.json({ error: INVITE_STATUS_MESSAGES.invalid }, { status: 410 })
        }
        return await setSessionCookie(NextResponse.json({ redirectTo: '/portal' }), user)
    } catch (e) {
        console.error('Accept invite error', e)
        return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 })
    }
}
