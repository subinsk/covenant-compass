import { describe, expect, it } from 'vitest'
import { findDuplicate, normalizeTitle, titlesOverlap } from './duplicates'

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

    it('catches a hand-added covenant with a shorter title', () => {
        expect(findDuplicate({ name: 'Maximum Total Net Leverage Ratio', metric: 'net-leverage' }, [{ id: 'h', title: 'Leverage Ratio', metric: null }])?.id).toBe('h')
    })

    it('returns null for a new covenant', () => {
        expect(findDuplicate({ name: 'Minimum Liquidity', metric: 'liquidity' }, existing)).toBeNull()
        expect(findDuplicate({ name: 'Anything', metric: 'x' }, [])).toBeNull()
    })
})

describe('titlesOverlap', () => {
    it('matches a short hand-added title inside a fuller extracted one', () => {
        expect(titlesOverlap('Leverage Ratio', 'Maximum Total Net Leverage Ratio')).toBe(true)
        expect(titlesOverlap('Maximum Consolidated Interest Coverage Ratio', 'interest coverage')).toBe(true)
    })

    it('keeps different tests apart', () => {
        expect(titlesOverlap('Interest Coverage', 'Fixed Charge Coverage Ratio')).toBe(false)
        expect(titlesOverlap('Senior Leverage Ratio', 'Total Leverage Ratio')).toBe(false)
        expect(titlesOverlap('Minimum Liquidity', 'Maximum Capex')).toBe(false)
    })

    it('falls back to the whole title when it is only filler', () => {
        expect(titlesOverlap('Ratio', 'Maximum Ratio')).toBe(false)
        expect(titlesOverlap('Ratio', 'ratio')).toBe(true)
    })
})

describe('normalizeTitle', () => {
    it('lowercases and collapses punctuation', () => {
        expect(normalizeTitle('  Fixed-Charge  Coverage (FCCR) ')).toBe('fixed charge coverage fccr')
    })
})
