import { timingSafeEqual } from 'node:crypto'

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
// Fails closed: with no secret configured, nothing is authorized.
export function isAuthorizedCron(authHeader: string | null, secret: string | undefined) {
    if (!secret || !authHeader) return false
    const expected = Buffer.from(`Bearer ${secret}`)
    const actual = Buffer.from(authHeader)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
}
