import { describe, expect, it } from 'vitest'
import { historyWhere, parsePage, parsePortalView, waiverReason } from './history'

describe('parsePortalView', () => {
    it('accepts history and defaults to open', () => {
        expect(parsePortalView('history')).toBe('history')
        expect(parsePortalView('open')).toBe('open')
        expect(parsePortalView(undefined)).toBe('open')
        expect(parsePortalView('other')).toBe('open')
    })
})

describe('parsePage', () => {
    it('reads positive integers and falls back to 1', () => {
        expect(parsePage('3')).toBe(3)
        expect(parsePage('0')).toBe(1)
        expect(parsePage('-2')).toBe(1)
        expect(parsePage('abc')).toBe(1)
        expect(parsePage(undefined)).toBe(1)
    })
})

describe('historyWhere', () => {
    it('limits to completed and waived occurrences in scope', () => {
        expect(historyWhere({ borrowerOrgId: 'org-1' })).toEqual({
            facility: { borrowerOrgId: 'org-1' },
            status: { in: ['COMPLETED', 'WAIVED'] },
        })
    })
})

describe('waiverReason', () => {
    it('returns null without a waiver line', () => {
        expect(waiverReason(null)).toBeNull()
        expect(waiverReason('Sent by email')).toBeNull()
    })

    it('returns the latest waiver reason', () => {
        expect(waiverReason('Waived 2026-01-02: Lender agreed')).toBe('Lender agreed')
        expect(waiverReason('Waived 2026-01-02: First\nReopened\nWaived 2026-02-03: Second')).toBe('Second')
    })
})
