import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { invalidInput, queryParams } from './http'
import { organizationQuerySchema } from './organization'

describe('queryParams', () => {
    it('drops empty values', () => {
        expect(queryParams('http://x/api?status=&ragStatus=RED')).toEqual({ ragStatus: 'RED' })
    })
})

describe('invalidInput', () => {
    it('returns 400 with flattened issues', async () => {
        const result = z.object({ name: z.string() }).safeParse({})
        if (result.success) throw new Error('expected failure')
        const res = invalidInput(result.error)
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toBe('Invalid input')
        expect(body.issues.fieldErrors.name).toBeDefined()
    })
})

describe('organizationQuerySchema', () => {
    it('accepts a valid org type and rejects others', () => {
        expect(organizationQuerySchema.parse({ type: 'BORROWER' })).toEqual({ type: 'BORROWER' })
        expect(organizationQuerySchema.safeParse({ type: 'BANK' }).success).toBe(false)
    })
})
