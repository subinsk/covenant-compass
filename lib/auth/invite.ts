import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

export const INVITE_TTL_DAYS = 7
export const MIN_PASSWORD_LENGTH = 8

// Only the hash is stored, so a database leak doesn't hand out working invite links.
export function hashInviteToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

// A fresh invite: the token goes in the link, the hash and expiry go on the user.
export function newInvite(now = new Date()) {
    const token = randomBytes(32).toString('base64url')
    return {
        token,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    }
}

export function invitePath(token: string): string {
    return `/invite/${token}`
}

type InvitedUser = { passwordHash: string | null; inviteExpiresAt: Date | null }

// Whether a user found by invite token can still accept it. Accepting clears the token,
// so a used link finds no user at all.
export function inviteStatus(user: InvitedUser | null, now = new Date()): 'valid' | 'invalid' | 'expired' {
    if (!user || user.passwordHash) return 'invalid'
    if (!user.inviteExpiresAt || user.inviteExpiresAt <= now) return 'expired'
    return 'valid'
}

export const INVITE_STATUS_MESSAGES = {
    invalid: 'This invite link is not valid or has already been used.',
    expired: 'This invite link has expired. Ask your lender for a new one.',
} as const

export const acceptInviteSchema = z.object({
    token: z.string().min(1).max(200),
    name: z.string().trim().min(1, 'Required').max(200),
    password: z.string()
        .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
        .max(200),
})
