import { describe, expect, it } from 'vitest'
import { planInvite, portalAccess } from './invite'

describe('planInvite', () => {
    it('creates a user for a borrower with none', () => {
        expect(planInvite({ orgUsers: [], email: 'cfo@initech.test', emailTaken: false }))
            .toEqual({ action: 'create', email: 'cfo@initech.test' })
    })

    it('renews the link of a pending invite instead of adding another user', () => {
        expect(planInvite({ orgUsers: [{ id: 'u1', passwordHash: null }], email: 'other@initech.test', emailTaken: false }))
            .toEqual({ action: 'regenerate', userId: 'u1' })
    })

    it('refuses when the borrower already has an active user', () => {
        expect(planInvite({ orgUsers: [{ id: 'u1', passwordHash: 'hash' }], email: 'x@y.test', emailTaken: false }))
            .toMatchObject({ action: 'refuse', status: 409 })
    })

    it('never reuses an email that belongs to another user', () => {
        expect(planInvite({ orgUsers: [], email: 'bob@globex.com', emailTaken: true }))
            .toMatchObject({ action: 'refuse', status: 409, error: expect.stringContaining('already exists') })
    })

    it('needs an email for a first invite', () => {
        expect(planInvite({ orgUsers: [], email: undefined, emailTaken: false }))
            .toMatchObject({ action: 'refuse', status: 400 })
    })
})

describe('portalAccess', () => {
    const now = new Date('2026-11-01T00:00:00Z')
    const later = new Date('2026-11-05T00:00:00Z')

    it('is NONE without users', () => {
        expect(portalAccess([], now)).toEqual({ status: 'NONE' })
    })

    it('is INVITED for a pending user, flagging an expired link', () => {
        expect(portalAccess([{ email: 'a@b.test', passwordHash: null, inviteExpiresAt: later }], now))
            .toEqual({ status: 'INVITED', email: 'a@b.test', expired: false })
        expect(portalAccess([{ email: 'a@b.test', passwordHash: null, inviteExpiresAt: now }], now))
            .toEqual({ status: 'INVITED', email: 'a@b.test', expired: true })
    })

    it('is ACTIVE once any user has a password', () => {
        expect(portalAccess([
            { email: 'a@b.test', passwordHash: null, inviteExpiresAt: later },
            { email: 'c@b.test', passwordHash: 'hash', inviteExpiresAt: null },
        ], now)).toEqual({ status: 'ACTIVE' })
    })
})
