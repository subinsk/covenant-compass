import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password', () => {
    it('accepts the right password and rejects others', async () => {
        const hash = await hashPassword('correct horse')
        expect(await verifyPassword('correct horse', hash)).toBe(true)
        expect(await verifyPassword('wrong', hash)).toBe(false)
        expect(await verifyPassword('secret', hash)).toBe(false)
    })

    it('does not store the password in plain text', async () => {
        const hash = await hashPassword('correct horse')
        expect(hash).not.toContain('correct horse')
    })

    it('rejects a plain-text value stored as the hash', async () => {
        expect(await verifyPassword('hashed_secret', 'hashed_secret')).toBe(false)
    })
})
