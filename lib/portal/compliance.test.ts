import { describe, expect, it } from 'vitest'
import { complianceScore } from './compliance'

describe('complianceScore', () => {
    it('returns null when nothing is completed or overdue', () => {
        expect(complianceScore([])).toBeNull()
        expect(complianceScore(['PENDING', 'WAIVED'])).toBeNull()
    })

    it('is 100 when everything decided was completed', () => {
        expect(complianceScore(['COMPLETED', 'COMPLETED', 'PENDING'])).toBe(100)
    })

    it('divides completed by completed plus overdue, rounded', () => {
        expect(complianceScore(['COMPLETED', 'OVERDUE'])).toBe(50)
        expect(complianceScore(['COMPLETED', 'COMPLETED', 'OVERDUE', 'WAIVED'])).toBe(67)
        expect(complianceScore(['OVERDUE'])).toBe(0)
    })
})
