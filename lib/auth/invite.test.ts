import { describe, expect, it } from 'vitest'
import { acceptInviteSchema, hashInviteToken, INVITE_TTL_DAYS, invitePath, inviteStatus, newInvite } from './invite'

const now = new Date('2026-11-01T12:00:00Z')

describe('newInvite', () => {
    it('makes a random url-safe token and stores only its hash', () => {
        const a = newInvite(now)
        const b = newInvite(now)
        expect(a.token).not.toBe(b.token)
        expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(a.tokenHash).toBe(hashInviteToken(a.token))
        expect(a.tokenHash).not.toContain(a.token)
    })

    it(`expires after ${INVITE_TTL_DAYS} days`, () => {
        expect(newInvite(now).expiresAt).toEqual(new Date('2026-11-08T12:00:00Z'))
    })
})

describe('hashInviteToken', () => {
    it('is a stable SHA-256 hex digest', () => {
        expect(hashInviteToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    })
})

describe('invitePath', () => {
    it('points at the public invite page', () => {
        expect(invitePath('tok')).toBe('/invite/tok')
    })
})

describe('inviteStatus', () => {
    const pending = { passwordHash: null, inviteExpiresAt: new Date('2026-11-02T00:00:00Z') }

    it('accepts a pending invite before it expires', () => {
        expect(inviteStatus(pending, now)).toBe('valid')
    })

    it('rejects an expired invite', () => {
        expect(inviteStatus({ ...pending, inviteExpiresAt: now }, now)).toBe('expired')
        expect(inviteStatus({ ...pending, inviteExpiresAt: null }, now)).toBe('expired')
    })

    it('rejects an unknown token or a user who already has a password', () => {
        expect(inviteStatus(null, now)).toBe('invalid')
        expect(inviteStatus({ ...pending, passwordHash: 'hash' }, now)).toBe('invalid')
    })
})

describe('acceptInviteSchema', () => {
    it('trims the name and accepts a long enough password', () => {
        expect(acceptInviteSchema.parse({ token: 't', name: '  Bob  ', password: 'longenough' }))
            .toEqual({ token: 't', name: 'Bob', password: 'longenough' })
    })

    it('rejects a short password, a blank name or a missing token', () => {
        expect(acceptInviteSchema.safeParse({ token: 't', name: 'Bob', password: 'short' }).success).toBe(false)
        expect(acceptInviteSchema.safeParse({ token: 't', name: '  ', password: 'longenough' }).success).toBe(false)
        expect(acceptInviteSchema.safeParse({ token: '', name: 'Bob', password: 'longenough' }).success).toBe(false)
    })
})
