import { describe, expect, it } from 'vitest'
import { formatPeriod } from './period'

describe('formatPeriod', () => {
    it('formats both ends', () => {
        expect(formatPeriod(new Date('2026-01-01T12:00:00Z'), '2026-03-31T12:00:00Z')).toBe('1 Jan 2026 – 31 Mar 2026')
    })

    it('returns an empty string when either end is missing', () => {
        expect(formatPeriod(null, new Date())).toBe('')
        expect(formatPeriod(new Date(), null)).toBe('')
    })
})
