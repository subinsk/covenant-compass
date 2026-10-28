import { describe, expect, it } from 'vitest'
import { createBorrowerSchema } from './borrower'

describe('createBorrowerSchema', () => {
    it('needs a name', () => {
        expect(createBorrowerSchema.safeParse({ name: '  ' }).success).toBe(false)
        expect(createBorrowerSchema.safeParse({}).success).toBe(false)
    })

    it('trims fields and drops blank optional ones', () => {
        const parsed = createBorrowerSchema.parse({ name: ' Acme ', industry: '', contactEmail: '', country: ' India ' })
        expect(parsed).toEqual({ name: 'Acme', country: 'India' })
    })

    it('checks the contact email', () => {
        expect(createBorrowerSchema.safeParse({ name: 'Acme', contactEmail: 'not-an-email' }).success).toBe(false)
        expect(createBorrowerSchema.parse({ name: 'Acme', contactEmail: ' cfo@acme.com ' }).contactEmail).toBe('cfo@acme.com')
    })

    it('rejects over-long values', () => {
        expect(createBorrowerSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false)
    })
})
