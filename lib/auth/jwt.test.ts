import { afterEach, describe, expect, it, vi } from 'vitest'
import { signToken, verifyToken } from './jwt'

const session = { userId: 'u1', email: 'a@example.com', role: 'LENDER_ADMIN', orgId: 'o1' }

describe('jwt', () => {
    afterEach(() => vi.unstubAllEnvs())

    it('verifies a token it signed and returns the payload', async () => {
        const token = await signToken(session)
        expect(await verifyToken(token)).toMatchObject(session)
    })

    it('rejects a tampered token', async () => {
        const token = await signToken(session)
        const [header, , signature] = token.split('.')
        const forgedBody = Buffer.from(JSON.stringify({ ...session, role: 'LENDER_ADMIN', userId: 'admin' })).toString('base64url')
        expect(await verifyToken(`${header}.${forgedBody}.${signature}`)).toBeNull()
    })

    it('rejects a token signed with a different secret', async () => {
        vi.stubEnv('JWT_SECRET', 'secret-one')
        const token = await signToken(session)
        vi.stubEnv('JWT_SECRET', 'secret-two')
        expect(await verifyToken(token)).toBeNull()
    })

    it('rejects garbage and empty tokens', async () => {
        expect(await verifyToken('not-a-token')).toBeNull()
        expect(await verifyToken('')).toBeNull()
    })

    it('refuses to run in production without JWT_SECRET', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('JWT_SECRET', '')
        await expect(signToken(session)).rejects.toThrow('JWT_SECRET must be set')
    })
})
