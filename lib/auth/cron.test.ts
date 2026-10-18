import { describe, expect, it } from 'vitest'
import { isAuthorizedCron } from './cron'

describe('isAuthorizedCron', () => {
    it('accepts the correct bearer secret', () => {
        expect(isAuthorizedCron('Bearer s3cret', 's3cret')).toBe(true)
    })

    it('rejects a wrong or missing header', () => {
        expect(isAuthorizedCron('Bearer wrong', 's3cret')).toBe(false)
        expect(isAuthorizedCron('s3cret', 's3cret')).toBe(false)
        expect(isAuthorizedCron(null, 's3cret')).toBe(false)
    })

    it('rejects everything when no secret is configured', () => {
        expect(isAuthorizedCron('Bearer ', '')).toBe(false)
        expect(isAuthorizedCron('Bearer undefined', undefined)).toBe(false)
    })
})
