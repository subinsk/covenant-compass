import { describe, expect, it } from 'vitest'
import { signToken, verifyToken } from './jwt'

describe('jwt', () => {
    it('verifies a token it signed and returns the payload', async () => {
        const token = await signToken({ userId: 'u1', role: 'LENDER_ADMIN' })
        const payload = await verifyToken(token)
        expect(payload).toMatchObject({ userId: 'u1', role: 'LENDER_ADMIN' })
    })

    it('rejects a tampered token', async () => {
        const token = await signToken({ userId: 'u1' })
        const [header, , signature] = token.split('.')
        const forgedBody = Buffer.from(JSON.stringify({ userId: 'admin' })).toString('base64url')
        expect(await verifyToken(`${header}.${forgedBody}.${signature}`)).toBeNull()
    })

    it('rejects garbage and empty tokens', async () => {
        expect(await verifyToken('not-a-token')).toBeNull()
        expect(await verifyToken('')).toBeNull()
    })
})
