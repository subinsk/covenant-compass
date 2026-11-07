import { describe, expect, it } from 'vitest'
import { findDuplicate, normalizeTitle } from './duplicates'

const existing = [
    { id: 'c1', title: 'Interest Coverage Ratio', metric: null },
    { id: 'c2', title: 'Max Leverage', metric: 'total-leverage' },
]

describe('findDuplicate', () => {
    it('matches the same metric even under another name', () => {
        expect(findDuplicate({ name: 'Maximum Total Leverage Ratio', metric: 'total-leverage' }, existing)?.id).toBe('c2')
    })

    it('matches the same title, ignoring case and punctuation', () => {
        expect(findDuplicate({ name: 'interest-coverage ratio.', metric: 'interest-coverage' }, existing)?.id).toBe('c1')
    })

    it('returns null for a new covenant', () => {
        expect(findDuplicate({ name: 'Minimum Liquidity', metric: 'liquidity' }, existing)).toBeNull()
        expect(findDuplicate({ name: 'Anything', metric: 'x' }, [])).toBeNull()
    })
})

describe('normalizeTitle', () => {
    it('lowercases and collapses punctuation', () => {
        expect(normalizeTitle('  Fixed-Charge  Coverage (FCCR) ')).toBe('fixed charge coverage fccr')
    })
})
