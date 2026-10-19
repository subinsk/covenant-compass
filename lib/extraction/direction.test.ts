import { describe, expect, it } from 'vitest'
import { checkDirection, directionFromQuote } from './direction'

// The three SPH covenants, exactly as qwen3:4b extracted them (operators inverted).
const sph = [
    { metric: 'interest-coverage' as const, operator: '<=' as const, quote: 'Permit the Consolidated Interest Coverage Ratio as of the end of any fiscal quarter of the Parent to be less than 2.50 to 1.00.' },
    { metric: 'leverage' as const, operator: '>=' as const, quote: 'Permit the Total Consolidated Leverage Ratio as of the end of any fiscal quarter of the Parent to be greater than 5.75 to 1.00.' },
    { metric: 'secured-leverage' as const, operator: '>=' as const, quote: 'Permit the Senior Secured Consolidated Leverage Ratio as of the end of any fiscal quarter of the Borrower to be greater than 3.25 to 1.00.' },
]

describe('directionFromQuote', () => {
    it('reads prohibitions', () => {
        expect(directionFromQuote('The Borrower shall not permit the Leverage Ratio to exceed 3.50 to 1.00.')).toBe('max')
        expect(directionFromQuote('will not permit the Interest Coverage Ratio to be less than 3.00 to 1.00')).toBe('min')
    })

    it('reads positive phrasing', () => {
        expect(directionFromQuote('maintain a Fixed Charge Coverage Ratio of at least 1.25 to 1.00')).toBe('min')
        expect(directionFromQuote('a Total Leverage Ratio not to exceed 4.00 to 1.00')).toBe('max')
        expect(directionFromQuote('a Leverage Ratio no greater than 4.00 to 1.00')).toBe('max')
    })

    it('returns null when the wording is ambiguous or silent', () => {
        expect(directionFromQuote('Section 7.11 Financial Covenants.')).toBeNull()
        expect(directionFromQuote('shall not permit the ratio to be greater than 4.0 or less than 1.0')).toBeNull()
    })
})

describe('checkDirection', () => {
    it('corrects the inverted SPH operators', () => {
        expect(sph.map((c) => checkDirection(c).operator)).toEqual(['>=', '<=', '<='])
        expect(sph.every((c) => checkDirection(c).operatorCorrected)).toBe(true)
    })

    it('leaves a correct operator alone', () => {
        expect(checkDirection({ ...sph[1], operator: '<=' })).toEqual({ operator: '<=', operatorCorrected: false, directionConflict: false })
        expect(checkDirection({ ...sph[1], operator: '<' })).toMatchObject({ operator: '<', operatorCorrected: false })
    })

    it('uses the wording when the metric is "other"', () => {
        expect(checkDirection({ metric: 'other', operator: '<=', quote: 'maintain a ratio of at least 1.10 to 1.00' }).operator).toBe('>=')
    })

    it('flags and does not change the operator when metric and wording disagree', () => {
        const result = checkDirection({ metric: 'leverage', operator: '>=', quote: 'shall not permit the ratio to be less than 1.0' })
        expect(result).toEqual({ operator: '>=', operatorCorrected: false, directionConflict: true })
    })
})
